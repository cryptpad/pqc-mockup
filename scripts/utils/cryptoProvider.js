import * as pqcCrypto from './pqcCrypto.js';
import * as classicCrypto from './classicCrypto.js';

export const CRYPTO_SCHEMES = {
    PQC: 'pqc',
    CLASSIC: 'classic'
};

export function getCryptoProvider(scheme = CRYPTO_SCHEMES.PQC) {
    switch (scheme) {
        case CRYPTO_SCHEMES.CLASSIC:
            return classicCrypto;
        case CRYPTO_SCHEMES.PQC:
        default:
            return pqcCrypto;
    }
}