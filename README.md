<!--
SPDX-FileCopyrightText: 2025 XWiki CryptPad Team <contact@cryptpad.org> and Iulian-Tudor Scutaru

SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Post-Quantum Cryptography Mockup

A simulation environment for testing and benchmarking post-quantum cryptography implementations against traditional cryptographic methods.

## Overview

This project provides a sandbox for experimenting with post-quantum cryptographic algorithms (specifically ML-KEM and ML-DSA) compared to traditional elliptic curve cryptography (NaCl/TweetNaCl). It simulates a collaborative document editing environment where users encrypt, decrypt, sign, and verify messages, allowing for performance and security analysis.

## Features

- **Dual Cryptography Support**: Implements both post-quantum and traditional cryptography providers
- **Multiple Encryption Paradigms**: Supports mailbox (direct user-to-user) and team-based encryption models
- **Realistic Simulation**: Models collaborative document editing with configurable parameters
- **Performance Analytics**: Collects and visualizes encryption, decryption, signing, and verification times
- **Configurable Environment**: Easily modify user counts, document distribution, and activity levels

## Cryptography Implementations

### Post-Quantum Provider (`pqcProvider.js`)
- Implements ML-KEM (CRYSTALS-Kyber) for key encapsulation
- Implements ML-DSA (CRYSTALS-Dilithium) for digital signatures
- Uses AES-GCM for symmetric encryption

### Traditional Provider (`naclProvider.js`)
- Uses Curve25519 for asymmetric encryption
- Uses Ed25519 for digital signatures
- Compatible with existing CryptPad encryption models

## Architecture

The system is built around these core components:

- **Crypto Providers**: Modular implementations of cryptographic primitives
- **User Model**: Simulates users with their own key pairs who perform cryptographic operations
- **Document Model**: Represents shared documents with multiple editors
- **Document Server**: Facilitates message broadcasting between users
- **Simulation Engine**: Orchestrates the entire simulation process

## Usage

### Running a Simulation

```javascript
import { runSimulation } from './scripts/simulation/Simulation.js';

// Configure the simulation parameters
const simulationParams = {
    numUsers: 30,
    numDocuments: 30,
    maxEditsPerUser: 100,
    logFrequency: 20,
    useDistribution: true,
    cryptoScheme: 'pqc',  // or 'nacl'
    encryptorType: 'mailbox'  // or 'team'
};

// Run the simulation
const results = await runSimulation(simulationParams);
```

### Simulation Parameters

- `numUsers`: Number of users to create
- `numDocuments`: Number of documents to create
- `maxEditsPerUser`: Maximum number of edits per user
- `logFrequency`: How often to log progress
- `useDistribution`: Whether to use statistical distributions for realistic user behavior
- `cryptoScheme`: Cryptography implementation to use ('pqc' or 'nacl')
- `encryptorType`: Encryption model to use ('mailbox' or 'team')

## Performance Considerations

When running simulations:

1. Post-quantum algorithms typically have larger key sizes and may be computationally more intensive
2. Team-based encryption reduces the number of encryption operations but may have higher initial overhead
3. For large simulations, consider increasing log frequency to reduce UI updates

## Implementation Details

### Multi-Recipient Encryption

The system supports two approaches for sending encrypted messages to multiple recipients:

1. **Mailbox encryption**: Each message is individually encrypted for each recipient
2. **Team encryption**: Messages are encrypted once with a shared team key

### Hybrid Encryption Process

For both providers, the encryption process works in layers:

1. Generate or retrieve asymmetric key pairs
2. Perform key encapsulation or key exchange
3. Use the resulting shared secret for symmetric encryption
4. Sign the message with the sender's private signing key

## Development

### Adding New Crypto Providers

To implement a new cryptographic provider:

1. Create a new provider class implementing the required methods
2. Register it in `cryptoProvider.js`
3. Update the `CRYPTO_SCHEMES` enum with the new scheme name

Required provider methods: (maintain name for compatibility with existing code)
- `init()`
- `generateKEMKeyPair()`
- `generateDSAKeyPair()`
- `createMailboxEncryptor(keys)`
- `createTeamEncryptor(keys)`

### Future Improvements

- Add support for additional post-quantum algorithms
- Add more detailed analysis of message sizes and bandwidth usage
- Create visual comparisons of cryptographic performance
- Add automated testing suite for cryptographic correctness

## License

This project is provided as is under the GNU Affero General Public License v3.0.
