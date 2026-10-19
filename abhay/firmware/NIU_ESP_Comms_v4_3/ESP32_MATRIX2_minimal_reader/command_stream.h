#pragma once
#include <stddef.h>
#include <string.h>
#include <ctype.h>
namespace appcommand {
// Exact command object; ignore whitespace only outside strings. No extra keys,
// escapes, embedded controls, or trailing objects are accepted.
inline unsigned kind(const char* input) {
    char compact[96];size_t n=0;bool quoted=false;
    for(const unsigned char* p=(const unsigned char*)input;*p;++p){
        if(*p=='"')quoted=!quoted;
        if(!quoted && (*p==' ' || *p=='\t' || *p=='\r' || *p=='\n'))continue;
        if(*p<32 || *p>126 || *p=='\\' || n>=95)return 0;
        compact[n++]=char(toupper(*p));
    }
    compact[n]=0;
    if(!strcmp(compact,"MOTOR_CLEAR_FAULT") || !strcmp(compact,"{\"CMD\":\"MOTOR_CLEAR_FAULT\"}"))return 1;
    if(!strcmp(compact,"{\"CMD\":\"MOTOR_CLEAR_FAULT_AND_ENABLE\"}"))return 2;
    return 0;
}
struct Stream {
    char line[96]{};size_t used=0;bool invalid=false,cr=false;
    void clear(){used=0;invalid=cr=false;line[0]=0;}
    template<class Consumer> void feed(char c,Consumer consume) {
        if(c=='\n') {if(!invalid && used){line[used]=0;consume(line);}clear();return;}
        if(cr){invalid=true;return;}
        if(c=='\r'){cr=true;return;}
        if(c<32 || c>126 || used>=95){invalid=true;return;}
        if(!invalid)line[used++]=c;
    }
    template<class Consumer> void endWrite(Consumer consume) {
        if(invalid || cr)return;
        line[used]=0;
        // Retain no-LF legacy commands; new recovery ALWAYS needs LF.
        if(kind(line)==1 || !strcmp(line,"PING") || !strcmp(line,"HELP") || !strcmp(line,"STATUS?")){
            consume(line);clear();
        }
    }
};
}
