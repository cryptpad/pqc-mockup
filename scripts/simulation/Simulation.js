import { User } from '../models/User.js';
import { DocumentServer } from '../models/DocumentServer.js';
import { Document } from "../models/Document.js";
import { SimulationAnalytics } from './SimulationAnalytics.js';
import {CRYPTO_SCHEMES} from '../utils/cryptoProvider.js';

export class Simulation {
    constructor(params = {}) {
        this.config = {
            numUsers: params.numUsers || 30,
            numDocuments: params.numDocuments || 30,
            maxEditsPerUser: params.maxEditsPerUser || 50000,
            logFrequency: params.logFrequency || 1000,
            useDistribution: params.useDistribution || false,
            cryptoScheme: params.cryptoScheme || CRYPTO_SCHEMES.PQC
        };

        this.users = [];
        this.documents = [];
        this.server = null;
        this.analytics = new SimulationAnalytics();

        this.logElement = document.getElementById("simulation-log");
        this.resultsElement = document.getElementById("results");
    }

    static randomGenerators = {
        uniform: (min, max) => Math.floor(Math.random() * (max - min + 1)) + min,

        logarithmic: (min, max) => {
            min = Math.max(1, min);
            const minLog = Math.log(min);
            const maxLog = Math.log(max + 1);
            const rand = Math.random() * (maxLog - minLog) + minLog;
            return Math.floor(Math.exp(rand) - 1 + min);
        }
    };

    async run() {
        try {
            this.resetUI();
            this.log("Starting simulation...");

            if (this.config.useDistribution) {
                this.log("Using uniform and logarithmic distribution for user activity.");
            }

            await this.initializeUsers();
            await this.initializeDocuments();
            await this.simulateUserActivity();

            this.log("<br>Simulation completed.");
            this.displayResults();

            return {
                users: this.users,
                documents: this.documents,
                analytics: this.analytics
            };
        } catch (error) {
            this.log(`<span style="color: red">Simulation error: ${error.message}</span>`);
            console.error("Simulation failed:", error);
            throw error;
        }
    }

    resetUI() {
        if (this.logElement) this.logElement.innerHTML = "";
        if (this.resultsElement) this.resultsElement.innerHTML = "";
    }

    log(message) {
        if (this.logElement) {
            this.logElement.innerHTML += `${message}<br>`;
        }
    }

    async initializeUsers() {
        this.log("Initializing users...");
        const { numUsers } = this.config;
        const cryptoScheme = this.config.cryptoScheme;

        for (let i = 0; i < numUsers; i++) {
            const user = new User(i, cryptoScheme);
            const success = await user.init();

            if (!success) {
                throw new Error(`Failed to initialize user ${i}`);
            }

            this.users.push(user);

            if (i % 5 === 0 || i === numUsers - 1) {
                this.log(`Initialized User ${i+1}/${numUsers}`);
            }
        }

        this.server = new DocumentServer(this.users);
    }

    async initializeDocuments() {
        const { numDocuments } = this.config;
        this.log(`Creating ${numDocuments} documents and assigning editors...`);

        for (let i = 0; i < numDocuments; i++) {
            this.documents.push(new Document(i));
        }

        this.assignEditorsToDocuments();

        for (const doc of this.documents) {
            this.log(`Document ${doc.id} has ${doc.editors.size} editors`);
        }
    }

    assignEditorsToDocuments() {
        for (const doc of this.documents) {
            const rand = Math.random();
            let numEditors = 1;
            let cumulativeProbability = 0.5;

            while (rand > cumulativeProbability && numEditors < this.users.length) {
                numEditors++;
                cumulativeProbability += 1/(numEditors+1);
            }

            const shuffledUsers = [...this.users].sort(() => Math.random() - 0.5);
            for (let i = 0; i < Math.min(numEditors, this.users.length); i++) {
                doc.addEditor(shuffledUsers[i].id);
            }
        }
    }

    async simulateUserActivity() {
        this.log("<br>Starting user activity simulation:");

        const userPromises = this.users.map(user =>
            this.simulateSingleUserActivity(user)
        );

        await Promise.all(userPromises);
    }

    async simulateSingleUserActivity(user) {
        const { maxEditsPerUser, logFrequency, useDistribution } = this.config;

        const editableDocuments = this.documents.filter(doc => doc.editors.has(user.id));
        if (editableDocuments.length === 0) return;

        const totalEdits = useDistribution
            ? Simulation.randomGenerators.uniform(1, 50000)
            : Simulation.randomGenerators.uniform(1, maxEditsPerUser);

        for (let i = 0; i < totalEdits; i++) {
            const doc = this.selectDocumentToEdit(user, editableDocuments);

            doc.incrementEdits(user.id);
            const message = `Edit ${i} on Doc ${doc.id} by User ${user.id}`;

            await this.handleEditBroadcast(user, doc, message);

            if (i > 0 && i % logFrequency === 0) {
                this.log(`User ${user.id} completed ${i}/${totalEdits} edits`);
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }

        this.log(`User ${user.id} completed all ${totalEdits} edits`);
    }


    selectDocumentToEdit(user, editableDocuments) {
        const { useDistribution } = this.config;

        if (useDistribution && editableDocuments.length > 1) {
            const sortedDocs = [...editableDocuments].sort((a, b) => a.id - b.id);

            if (Math.random() < 0.1) {
                return sortedDocs[Math.floor(Math.random() * sortedDocs.length)];
            } else {
                const index = Math.min(
                    Simulation.randomGenerators.logarithmic(0, sortedDocs.length - 1),
                    sortedDocs.length - 1
                );
                return sortedDocs[index];
            }
        } else {
            return editableDocuments[Math.floor(Math.random() * editableDocuments.length)];
        }
    }

    async handleEditBroadcast(user, doc, message) {
        const recipients = [...doc.editors].filter(id => id !== user.id);

        if (recipients.length > 0) {
            for (const recipientId of recipients) {
                const recipient = this.server.users.find(u => u.id === recipientId);

                if (recipient) {
                    try {
                        const block = await user.encryptAndSignBlock(message, recipient.kemKeys.publicKey);
                        block.recipientId = recipient.id;
                        block.documentId = doc.id;
                        await this.server.broadcastBlock(block);
                    } catch (error) {
                        console.error(`Failed to broadcast to user ${recipientId}:`, error);
                    }
                }
            }
        } else {
            try {
                const block = await user.encryptAndSignBlock(message, user.kemKeys.publicKey);
                block.recipientId = user.id;
                block.documentId = doc.id;
            } catch (error) {
                console.error(`Failed to create self-broadcast block:`, error);
            }
        }
    }

    displayResults() {
        if (!this.resultsElement) return;

        this.resultsElement.innerHTML = '';

        this.renderDocumentStatistics();

        this.renderUserStatistics();

        this.renderSimulationSummary();
    }

    renderDocumentStatistics() {
        const docHeading = document.createElement('div');
        docHeading.className = 'section-heading';
        docHeading.innerHTML = "<h2>Document Statistics</h2>";
        this.resultsElement.appendChild(docHeading);

        const docContainer = document.createElement('div');
        docContainer.className = 'cards-container';
        this.resultsElement.appendChild(docContainer);

        this.documents.forEach(doc => {
            const docCard = document.createElement('div');
            docCard.className = 'doc-card';
            docCard.innerHTML = `
                <h3>Document ${doc.id}</h3>
                <div class="stat-row">
                    <span class="stat-label">Editors:</span>
                    <span class="stat-value">${doc.editors.size}</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Total Edits:</span>
                    <span class="stat-value">${doc.edits}</span>
                </div>
            `;
            docContainer.appendChild(docCard);
        });
    }

    renderUserStatistics() {
        const userHeading = document.createElement('div');
        userHeading.className = 'section-heading';
        userHeading.innerHTML = "<h2>User Cryptography Performance</h2>";
        this.resultsElement.appendChild(userHeading);

        const userContainer = document.createElement('div');
        userContainer.className = 'cards-container';
        this.resultsElement.appendChild(userContainer);

        const activeUsers = this.users.filter(user => user.stats.length > 0);

        activeUsers.sort((a, b) => a.id - b.id).forEach(user => {
            const stats = this.calculateUserStats(user);

            const userCard = document.createElement('div');
            userCard.className = 'user-card';
            userCard.innerHTML = `
                <h3>User ${user.id}</h3>
                <div class="stat-row">
                    <span class="stat-label">Encryption:</span>
                    <span class="stat-value">${stats.encryptTime.toFixed(2)} ms</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Signing:</span>
                    <span class="stat-value">${stats.signTime.toFixed(2)} ms</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Decryption:</span>
                    <span class="stat-value">${stats.decryptTime.toFixed(2)} ms</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Verification:</span>
                    <span class="stat-value">${stats.verifyTime.toFixed(2)} ms</span>
                </div>
            `;
            userContainer.appendChild(userCard);
        });
    }

    calculateUserStats(user) {
        const getAverage = (statsArray, property) => {
            const filteredStats = statsArray.filter(s => s[property] > 0);
            return filteredStats.length > 0 ?
                filteredStats.reduce((a, b) => a + b[property], 0) / filteredStats.length : 0;
        };

        return {
            encryptTime: getAverage(user.stats, 'encryptTime'),
            signTime: getAverage(user.stats, 'signTime'),
            decryptTime: getAverage(user.stats, 'decryptTime'),
            verifyTime: getAverage(user.stats, 'verifyTime')
        };
    }

    renderSimulationSummary() {
        this.analytics.trackSimulation(this.users, this.documents, this.config.useDistribution);

        const downloadButton = document.createElement('button');
        downloadButton.textContent = 'Download Analysis Data';
        downloadButton.style.padding = '10px 15px';
        downloadButton.style.backgroundColor = '#3498db';
        downloadButton.style.color = 'white';
        downloadButton.style.border = 'none';
        downloadButton.style.borderRadius = '4px';
        downloadButton.style.cursor = 'pointer';
        downloadButton.style.marginTop = '20px';
        downloadButton.onclick = () => this.analytics.downloadAsJSON();
        this.resultsElement.appendChild(downloadButton);

        const summary = this.analytics.generateSummary();
        const summaryDiv = document.createElement('div');
        summaryDiv.className = 'summary-container';
        summaryDiv.style.width = '100%';
        summaryDiv.style.marginTop = '30px';
        summaryDiv.style.backgroundColor = '#f8f9fa';
        summaryDiv.style.padding = '15px';
        summaryDiv.style.borderRadius = '8px';

        summaryDiv.innerHTML = `
            <h2 style="color:#3498db;text-align:center;margin-bottom:15px">Simulation Summary</h2>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:15px">
                <div>
                    <h3>Document Statistics</h3>
                    <p>Total Documents: ${summary.totalDocuments}</p>
                    <p>Total Edits: ${summary.totalEdits}</p>
                    <p>Average Edits Per Document: ${summary.averageEditsPerDocument.toFixed(2)}</p>
                    <p>Most Edited: Document ${summary.mostEditedDocument.id} (${summary.mostEditedDocument.totalEdits} edits)</p>
                    <p>Least Edited: Document ${summary.leastEditedDocument.id} (${summary.leastEditedDocument.totalEdits} edits)</p>
                    <p>${summary.distributionAnalysis}</p>
                </div>
                <div>
                    <h3>Cryptography Performance</h3>
                    <p>Average Encrypt Time: ${summary.cryptoPerformance.averageEncryptTime.toFixed(2)} ms</p>
                    <p>Average Sign Time: ${summary.cryptoPerformance.averageSignTime.toFixed(2)} ms</p>
                    <p>Average Decrypt Time: ${summary.cryptoPerformance.averageDecryptTime.toFixed(2)} ms</p>
                    <p>Average Verify Time: ${summary.cryptoPerformance.averageVerifyTime.toFixed(2)} ms</p>
                </div>
            </div>
        `;

        this.resultsElement.appendChild(summaryDiv);
    }
}

export async function runSimulation(params = {}) {
    const simulation = new Simulation(params);
    return await simulation.run();
}