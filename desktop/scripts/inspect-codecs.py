"""Read the real Electron FFmpeg decoder list without compiling a Node addon."""
import ctypes
import json
import sys

class Descriptor(ctypes.Structure):
    _fields_ = [('id', ctypes.c_int), ('type', ctypes.c_int),
                ('name', ctypes.c_char_p), ('long_name', ctypes.c_char_p)]

library = ctypes.CDLL(sys.argv[1])
next_descriptor = library.avcodec_descriptor_next
next_descriptor.argtypes = [ctypes.POINTER(Descriptor)]
next_descriptor.restype = ctypes.POINTER(Descriptor)
find_decoder = library.avcodec_find_decoder
find_decoder.argtypes = [ctypes.c_int]
find_decoder.restype = ctypes.c_void_p
result = []
descriptor = next_descriptor(None)
while descriptor:
    value = descriptor.contents
    if find_decoder(value.id):
        result.append({'name': value.name.decode(), 'longName': (value.long_name or b'').decode()})
    descriptor = next_descriptor(descriptor)
print(json.dumps(result))
