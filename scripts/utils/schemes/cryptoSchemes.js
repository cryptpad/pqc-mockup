import { ml_kem1024 } from "https://cdn.jsdelivr.net/npm/@noble/post-quantum/ml-kem/+esm";
import { ml_dsa87 } from "https://cdn.jsdelivr.net/npm/@noble/post-quantum/ml-dsa/+esm";
import { gcm } from "https://cdn.jsdelivr.net/npm/@noble/ciphers/aes/+esm";

export const kemSchemes = {
    'ml-kem-1024': {
        name: 'ML-KEM-1024',
        keygen: () => ml_kem1024.keygen(),
        encapsulate: (pk) => ml_kem1024.encapsulate(pk),
        decapsulate: (ct, sk) => ml_kem1024.decapsulate(ct, sk)
    }
};

export const signatureSchemes = {
    'ml-dsa-87': {
        name: 'ML-DSA-87',
        keygen: () => ml_dsa87.keygen(),
        sign: (sk, data) => ml_dsa87.sign(sk, data),
        verify: (pk, data, signature) => ml_dsa87.verify(pk, data, signature)
    }
};

export const symmetricCiphers = {
    'aes-gcm': {
        name: 'AES-GCM',
        encrypt: (data, key) => {
            const iv = window.crypto.getRandomValues(new Uint8Array(12));
            const ciphertext = gcm(key, iv).encrypt(data);
            const result = new Uint8Array(iv.length + ciphertext.length);
            result.set(iv);
            result.set(ciphertext, iv.length);
            return result;
        },
        decrypt: (encryptedData, key) => {
            const iv = encryptedData.slice(0, 12);
            const ciphertext = encryptedData.slice(12);
            return gcm(key, iv).decrypt(ciphertext);
        }
    }
};
