// Native smoke test for SukottoCapture. Run in GitHub Actions before ARMv7 build.
// Uses a simulated removable volume; never touches MPC's filesystem.
#include "../sukotto_capture.h"
#include <cassert>
#include <chrono>
#include <cstring>
#include <dirent.h>
#include <cstdio>
#include <string>
#include <thread>
#include <vector>
#include <sys/stat.h>
#include <unistd.h>

static void rest(int ms=90) { std::this_thread::sleep_for(std::chrono::milliseconds(ms)); }

static std::vector<std::string> wavs(const std::string& dir) {
    std::vector<std::string> out;
    if (DIR* d = opendir(dir.c_str())) {
        for (struct dirent* e; (e = readdir(d)); ) {
            std::string n = e->d_name;
            if (n.size() >= 4 && n.substr(n.size()-4)==".wav") out.push_back(dir+"/"+n);
        }
        closedir(d);
    }
    return out;
}

int main() {
    const std::string volume = "/tmp/sukotto-capture-ci";
    mkdir(volume.c_str(),0755);
    mkdir((volume+"/VST2 Plugins").c_str(),0755);
    mkdir((volume+"/VST2 Plugins/Test Unit").c_str(),0755);
    const std::string out = volume + "/Sukotto Samples";
    {
        SukottoCapture deck(volume + "/VST2 Plugins/Test Unit");
        assert(deck.state()==SukottoCapture::READY);
        deck.command(SukottoCapture::REC);
        rest();
        assert(deck.state()==SukottoCapture::RECORDING);
        float l[128],r[128];
        for (int i=0;i<128;++i) { l[i] = (i%32 <16 ? .3f : -.3f); r[i]=l[i]*.8f; }
        for (int i=0;i<400;++i) deck.push(l,r,128);
        rest(350);
        deck.command(SukottoCapture::REC);
        rest(200);
        assert(deck.state()==SukottoCapture::SAVED);
        assert(wavs(out).size()==1);
        {
            auto files=wavs(out);
            std::FILE* f = std::fopen(files[0].c_str(),"rb");
            assert(f);
            char header[44];
            assert(std::fread(header,1,44,f)==44);
            assert(std::memcmp(header,"RIFF",4)==0);
            assert(std::memcmp(header+8,"WAVEfmt ",8)==0);
            assert(std::memcmp(header+36,"data",4)==0);
            std::fseek(f,0,SEEK_END);
            assert(std::ftell(f)>44+128*4);
            std::fclose(f);
        }
        deck.command(SukottoCapture::LAST_30);
        rest(250);
        assert(deck.state()==SukottoCapture::SAVED);
        assert(wavs(out).size()==2);
        deck.shutdown();
    }
    std::puts("Sukotto Capture: REC/STOP and retro 30s produced two valid WAVs.");
}
