"""Parse the saved Standard MIDI file, including notes and musical metadata."""
import struct


def midi_summary(data):
    if len(data)<22 or data[:4]!=b'MThd' or struct.unpack('>I',data[4:8])[0]!=6:
        raise AssertionError('Invalid MIDI header')
    fmt,tracks,ppq=struct.unpack('>HHH',data[8:14])
    if fmt!=0 or tracks!=1 or ppq!=960 or data[14:18]!=b'MTrk':
        raise AssertionError('Unexpected MIDI track structure')
    length=struct.unpack('>I',data[18:22])[0]
    if len(data)!=22+length:raise AssertionError('Truncated MIDI track')
    offset=22;tick=0;notes=0;tempos=[];meters=[];ended=False

    def variable():
        nonlocal offset
        value=0
        for _ in range(4):
            byte=data[offset];offset+=1;value=(value<<7)|(byte&127)
            if not byte&128:return value
        raise AssertionError('Invalid MIDI variable integer')

    while offset<len(data):
        tick+=variable();status=data[offset];offset+=1
        if status==255:
            kind=data[offset];offset+=1;size=variable();payload=data[offset:offset+size];offset+=size
            if len(payload)!=size:raise AssertionError('Truncated MIDI event')
            if kind==0x51:
                if size!=3:raise AssertionError('Invalid MIDI tempo')
                tempos.append(int.from_bytes(payload,'big'))
            if kind==0x58:
                if size!=4:raise AssertionError('Invalid MIDI time signature')
                meters.append([payload[0],2**payload[1]])
            if kind==0x2f:
                if size or offset!=len(data):raise AssertionError('Invalid MIDI end marker')
                ended=True
        elif status&240 in (0x80,0x90):
            note,velocity=data[offset:offset+2];offset+=2
            if note>127 or velocity>127:raise AssertionError('Invalid MIDI note')
            if status&240==0x90 and velocity:notes+=1
        else:
            raise AssertionError('Unexpected MIDI event '+hex(status))
    if not ended or not notes or not tempos or not meters or not tick:
        raise AssertionError('Missing musical events in saved MIDI')
    return {'format':fmt,'tracks':tracks,'ppq':ppq,'notes':notes,'tempos_microseconds':tempos,'meters':meters,'end_tick':tick}
