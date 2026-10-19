#pragma once
#include <stdint.h>
#include <stddef.h>
#include <string.h>

// Independently implemented 32-bit RTT memory ABI, one up/down channel.
// Main thread is the only target reader/writer; SWD owns the opposite index.
// No blocking, heap, IRQ printing, USB, UART, SWO or SEGGER library required.
namespace labrtt {
struct Channel {
    const char *name;
    volatile char *buffer;
    uint32_t size;
    volatile uint32_t write, read;
    uint32_t flags;
};
struct Control {
    volatile char id[16];
    uint32_t upCount, downCount;
    Channel up, down;
};
static_assert(sizeof(Channel)==24 && offsetof(Channel,write)==12,"RTT requires 32-bit pointers");
static_assert(offsetof(Control,up)==24 && sizeof(Control)==72,"RTT control ABI");
static volatile char upBuffer[4096], downBuffer[256];
alignas(4) static Control block;
inline void begin() {
    block.upCount=block.downCount=1;
    block.up={"NIU console",upBuffer,sizeof(upBuffer),0,0,0};
    block.down={"NIU commands",downBuffer,sizeof(downBuffer),0,0,0};
    __DMB();
    const char magic[]="NIU LAB RTT";
    for(unsigned i=0;i<sizeof(magic);++i) block.id[i]=magic[i];
    __DMB();
}
inline unsigned write(const char *data,unsigned length) {
    Channel &c=block.up;
    const uint32_t w=c.write,r=c.read;
    if(w>=c.size || r>=c.size) return 0;
    const unsigned free=(r+c.size-w-1)%c.size;
    const unsigned n=length<free?length:free;
    for(unsigned i=0;i<n;++i)c.buffer[(w+i)%c.size]=data[i];
    __DMB();c.write=(w+n)%c.size;
    return n;
}
inline int read() {
    Channel &c=block.down;
    const uint32_t r=c.read,w=c.write;
    if(r>=c.size || w>=c.size || r==w) return -1;
    __DMB();const unsigned char value=c.buffer[r];
    __DMB();c.read=(r+1)%c.size;
    return value;
}
}
