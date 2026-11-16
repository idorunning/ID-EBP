#!/usr/bin/env python3
"""Decrypt an ID-EBP backup (.idebp.enc) to JSON Lines.

Usage: python3 decrypt-backup.py idebp-backup-private-key.pem 2026-11-16.idebp.enc out.jsonl
Needs: pip install cryptography
Format: b'IDEBPBK1' | uint32 len | RSA-OAEP-SHA256 wrapped AES-256 key | 12-byte IV | AES-GCM(gzip(jsonl))
"""
import gzip, struct, sys
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

key_path, src, dst = sys.argv[1:4]
data = open(src, 'rb').read()
if data[:8] != b'IDEBPBK1':
    sys.exit('not an ID-EBP backup file')
n = struct.unpack('>I', data[8:12])[0]
wrapped, iv, ct = data[12:12 + n], data[12 + n:24 + n], data[24 + n:]
priv = serialization.load_pem_private_key(open(key_path, 'rb').read(), password=None)
aes_key = priv.decrypt(wrapped, padding.OAEP(mgf=padding.MGF1(hashes.SHA256()), algorithm=hashes.SHA256(), label=None))
plain = gzip.decompress(AESGCM(aes_key).decrypt(iv, ct, None))
open(dst, 'wb').write(plain)
print(f'decrypted {len(plain):,} bytes to {dst}')
