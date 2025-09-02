// SPDX-FileCopyrightText: 2025 XWiki CryptPad Team <contact@cryptpad.org> and Iulian-Tudor Scutaru
//
// SPDX-License-Identifier: AGPL-3.0-or-later

import { createNaclProvider } from './providers/naclProvider.js';
import { createPQCProvider } from './providers/pqcProvider.js';
import { createElGamalProvider } from './providers/elgamalProvider.js';
import { kemSchemes, signatureSchemes, symmetricCiphers } from './schemes/cryptoSchemes.js';

export const CRYPTO_SCHEMES = {
    PQC: 'pqc',
    NACL: 'nacl',
    ELGAMAL: 'elgamal'
};

export const ENCRYPTOR_TYPES = {
    MAILBOX: 'mailbox',
    TEAM: 'team'
};

export { kemSchemes, signatureSchemes, symmetricCiphers };

export function getCryptoProvider(scheme = CRYPTO_SCHEMES.PQC, options = {}) {
    console.log(`[CryptoProvider] Creating provider for scheme: ${scheme}`);
    if (scheme === CRYPTO_SCHEMES.NACL) {
        console.log('[CryptoProvider] Using NaCl (TweetNaCl) implementation');
        return createNaclProvider();
    } else if (scheme === CRYPTO_SCHEMES.ELGAMAL) {
        console.log('[CryptoProvider] Using ElGamal hybrid encryption implementation');
        return createElGamalProvider();
    } else {
        console.log('[CryptoProvider] Using Post-Quantum Cryptography implementation');
        console.log(`[CryptoProvider] KEM: ${options.kem || 'ml-kem-1024'}, Signature: ${options.signature || 'ml-dsa-87'}`);
        return createPQCProvider(options);
    }
}
