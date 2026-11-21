// Sukotto Digger: standalone, bounded PCM capture for MPC Gen 1.
// License: MIT. Run file I/O ONLY on the writer thread, never in process().
// The WAVs are deliberately ordinary 44.1 kHz / 16-bit stereo so the MPC Browser
// can load them into the sample pool, where Sample Edit > Chop is available.
#pragma once
#include <algorithm>
#include <atomic>
#include <cerrno>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <fcntl.h>
#include <ctime>
#include <memory>
#include <string>
#include <thread>
#include <chrono>
#include <sys/stat.h>
#include <unistd.h>

class SukottoCapture final {
public:
    enum Action : uint32_t { REC = 1u, MARK_IN = 2u, MARK_OUT = 4u,
                             LAST_30 = 8u, CLEAR = 16u };
    enum State : int { READY, RECORDING, SAVED, DISK_ERROR, NOTHING_TO_SAVE,
                       CAPTURE_LIMIT, DROPPED_AUDIO };
    static const uint32_t RATE = 44100;
    static const uint32_t RETRO = RATE * 30;
    static const uint32_t FIFO = 1u << 18; // 5.9 seconds, power-of-two
    static const uint32_t LIMIT = RATE * 180; // max three minutes per take

    explicit SukottoCapture(const std::string& pluginFolder)
        : base_(sampleDirectory(pluginFolder)),
          fifo_(new Stereo[FIFO]), history_(new Stereo[RETRO]),
          writer_(&SukottoCapture::loop, this) {}
    ~SukottoCapture() { shutdown(); }

    SukottoCapture(const SukottoCapture&) = delete;
    SukottoCapture& operator=(const SukottoCapture&) = delete;

    void shutdown() {
        stopping_.store(true, std::memory_order_release);
        if (writer_.joinable()) writer_.join();
    }

    void command(Action a) noexcept { commands_.fetch_or((uint32_t)a, std::memory_order_release); }

    // SPSC: the MPC audio callback is the sole producer. This is allocation-free,
    // lock-free and bounded, even if the USB/SD media becomes very slow or full.
    void push(const float* left, const float* right, int frames) noexcept {
        if (!left || !right || frames <= 0) return;
        const uint32_t w = write_.load(std::memory_order_relaxed);
        const uint32_t r = read_.load(std::memory_order_acquire);
        const uint32_t free = FIFO - (w - r);
        const uint32_t n = std::min((uint32_t)frames, free);
        for (uint32_t i = 0; i < n; ++i) {
            Stereo& f = fifo_[(w + i) & (FIFO - 1)];
            f.l = toPCM(left[i]); f.r = toPCM(right[i]);
        }
        if (n) write_.store(w + n, std::memory_order_release);
        if (n != (uint32_t)frames) overruns_.fetch_add((uint32_t)frames - n, std::memory_order_relaxed);
    }

    int state() const noexcept { return state_.load(std::memory_order_relaxed); }
    uint32_t elapsedSeconds() const noexcept { return frames_.load(std::memory_order_relaxed) / RATE; }
    uint32_t overrunFrames() const noexcept { return overruns_.load(std::memory_order_relaxed); }

private:
    struct Stereo { int16_t l, r; };
    std::string base_;
    std::unique_ptr<Stereo[]> fifo_, history_;
    std::atomic<uint32_t> write_{0}, read_{0}, commands_{0}, overruns_{0}, frames_{0};
    std::atomic<int> state_{READY};
    std::atomic<bool> stopping_{false};
    std::thread writer_;
    uint32_t histPos_ = 0, histSize_ = 0;
    std::FILE* file_ = nullptr;
    uint32_t fileFrames_ = 0, serial_ = 0;
    std::string fileName_;

    static int16_t toPCM(float f) noexcept {
        if (!std::isfinite(f)) return 0;
        const float v = std::max(-1.0f, std::min(1.0f, f));
        return (int16_t)(v * (v < 0 ? 32768.0f : 32767.0f));
    }

    static std::string sampleDirectory(std::string pluginFolder) {
        // <volume>/VST2 Plugins/<vendor - VST - Sukotto Digger> -> <volume>/Sukotto Samples
        const auto a = pluginFolder.find_last_of("/\\");
        if (a == std::string::npos) return "";
        pluginFolder.resize(a);
        const auto b = pluginFolder.find_last_of("/\\");
        if (b == std::string::npos) return "";
        return pluginFolder.substr(0, b) + "/Sukotto Samples";
    }

    static void u16(uint8_t* p, uint16_t x) {
        p[0] = (uint8_t)x; p[1] = (uint8_t)(x >> 8);
    }
    static void u32(uint8_t* p, uint32_t x) {
        p[0] = (uint8_t)x; p[1] = (uint8_t)(x >> 8);
        p[2] = (uint8_t)(x >> 16); p[3] = (uint8_t)(x >> 24);
    }
    static bool wavHeader(std::FILE* f, uint32_t nFrames) {
        uint8_t h[44] = {};
        std::memcpy(h, "RIFF", 4); u32(h+4, 36 + nFrames * 4);
        std::memcpy(h+8, "WAVEfmt ", 8); u32(h+16, 16); // PCM fmt chunk
        u16(h+20, 1); u16(h+22, 2);
        u32(h+24, RATE); u32(h+28, RATE * 4);
        u16(h+32, 4); u16(h+34, 16);
        std::memcpy(h+36, "data", 4); u32(h+40, nFrames * 4);
        return std::fseek(f, 0, SEEK_SET) == 0 && std::fwrite(h, 1, sizeof(h), f) == sizeof(h);
    }

    bool openNew() {
        if (base_.empty()) { state_.store(DISK_ERROR); return false; }
        if (::mkdir(base_.c_str(), 0775) != 0 && errno != EEXIST) {
            state_.store(DISK_ERROR); return false;
        }
        char date[32] = {};
        std::time_t now = std::time(nullptr);
        struct tm t;
        if (localtime_r(&now, &t)) std::strftime(date, sizeof(date), "%Y%m%d_%H%M%S", &t);
        else std::snprintf(date, sizeof(date), "%lld", (long long)now);
        // Exclusive creation: never overwrite a previously saved MPC sample.
        int fd = -1;
        for (int i = 0; i < 1000; ++i) {
            fileName_ = base_ + "/SUKOTTO_" + date + "_" + std::to_string(::getpid())
                      + "_" + std::to_string(++serial_) + ".wav";
            fd = ::open(fileName_.c_str(), O_CREAT | O_EXCL | O_RDWR, 0664);
            if (fd >= 0 || errno != EEXIST) break;
        }
        if (fd < 0) { state_.store(DISK_ERROR); return false; }
        file_ = ::fdopen(fd, "wb+");
        if (!file_) { ::close(fd); std::remove(fileName_.c_str()); state_.store(DISK_ERROR); return false; }
        fileFrames_ = 0;
        frames_.store(0);
        if (!wavHeader(file_, 0)) { closeTake(false); state_.store(DISK_ERROR); return false; }
        state_.store(RECORDING);
        return true;
    }

    void closeTake(bool keep) {
        if (!file_) return;
        bool okay = keep && fileFrames_ != 0 && wavHeader(file_, fileFrames_);
        if (std::fclose(file_) != 0) okay = false;
        file_ = nullptr;
        if (!okay) std::remove(fileName_.c_str());
        state_.store(!keep || !fileFrames_ ? NOTHING_TO_SAVE : okay ? SAVED : DISK_ERROR);
    }

    void collect(const Stereo* chunk, uint32_t n) {
        for (uint32_t i = 0; i < n; ++i) {
            history_[histPos_] = chunk[i];
            histPos_ = (histPos_ + 1) % RETRO;
        }
        histSize_ = std::min(RETRO, histSize_ + n);
        if (!file_) return;
        const uint32_t allowed = std::min(n, LIMIT - fileFrames_);
        if (allowed && std::fwrite(chunk, sizeof(Stereo), allowed, file_) != allowed) {
            closeTake(false); state_.store(DISK_ERROR); return;
        }
        fileFrames_ += allowed;
        frames_.store(fileFrames_, std::memory_order_relaxed);
        if (fileFrames_ >= LIMIT) {
            closeTake(true);
            state_.store(CAPTURE_LIMIT);
        }
    }

    void last30() {
        if (histSize_ == 0) { state_.store(NOTHING_TO_SAVE); return; }
        if (file_) return; // don't interrupt an active recording
        if (!openNew()) return;
        const uint32_t start = (histPos_ + RETRO - histSize_) % RETRO;
        const uint32_t first = std::min(histSize_, RETRO - start);
        const uint32_t second = histSize_ - first;
        if (std::fwrite(history_.get() + start, sizeof(Stereo), first, file_) != first ||
            (second && std::fwrite(history_.get(), sizeof(Stereo), second, file_) != second)) {
            closeTake(false); state_.store(DISK_ERROR); return;
        }
        fileFrames_ = histSize_;
        frames_.store(fileFrames_);
        closeTake(true);
    }

    void perform(uint32_t cmd) {
        if (cmd & CLEAR) {
            if (file_) closeTake(true);
            histSize_ = 0; histPos_ = 0;
        }
        if (cmd & MARK_OUT) {
            if (file_) closeTake(true);
        }
        if (cmd & MARK_IN) {
            if (!file_) openNew();
        }
        if (cmd & REC) {
            if (file_) closeTake(true);
            else openNew();
        }
        if (cmd & LAST_30) last30();
    }

    void loop() {
        Stereo chunk[1024];
        while (!stopping_.load(std::memory_order_acquire)) {
            uint32_t n = std::min((uint32_t)1024, write_.load(std::memory_order_acquire)
                                 - read_.load(std::memory_order_relaxed));
            if (n) {
                uint32_t r = read_.load(std::memory_order_relaxed);
                for (uint32_t i = 0; i < n; ++i) chunk[i] = fifo_[(r + i) & (FIFO - 1)];
                read_.store(r + n, std::memory_order_release);
                collect(chunk, n);
            }
            uint32_t cmd = commands_.exchange(0, std::memory_order_acq_rel);
            if (cmd) perform(cmd);
            if (!n && !cmd) std::this_thread::sleep_for(std::chrono::milliseconds(6));
            if (overruns_.load(std::memory_order_relaxed) && state_.load() == RECORDING)
                state_.store(DROPPED_AUDIO); // warn; recording continues
        }
        if (file_) closeTake(true);
    }
};
