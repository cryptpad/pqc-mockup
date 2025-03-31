import { User } from './User.js';
import { DocumentServer } from './DocumentServer.js';
import { Document } from "./Document.js";

// Default values (will be overridden by passed params)
const DEFAULT_NUM_USERS = 30;
const DEFAULT_NUM_DOCUMENTS = 30;
const DEFAULT_MAX_EDITS_PER_USER = 50000;
const DEFAULT_LOG_FREQUENCY = 1000;

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function assignEditorsToDocuments(users, documents) {
    for (const doc of documents){
        const rand = Math.random();
        let numEditors = 1;
        let cumulativeProbability = 0.5;

        while (rand > cumulativeProbability && numEditors < users.length) {
            numEditors++;
            cumulativeProbability += 1/(numEditors+1);
        }

        const shuffledUsers = [...users].sort(() => Math.random() - 0.5);
        for (let i = 0; i < Math.min(numEditors, users.length); i++){
            doc.addEditor(shuffledUsers[i].id);
        }
    }
}

async function simulateUserActivity(user, documents, server, logDiv, params) {
    const maxEditsPerUser = params.maxEditsPerUser;
    const logFrequency = params.logFrequency;

    const editableDocuments = documents.filter(doc => doc.editors.has(user.id));
    if (editableDocuments.length === 0) return;

    const totalEdits = getRandomInt(1, maxEditsPerUser);

    for (let i = 0; i < totalEdits; i++) {
        const doc = editableDocuments[Math.floor(Math.random() * editableDocuments.length)];
        doc.incrementEdits();

        const message = `Edit ${i} on Doc ${doc.id} by User ${user.id}`;

        const recipients = [...doc.editors].filter(id => id !== user.id);

        if (recipients.length > 0) {
            for (const recipientId of recipients) {
                const recipient = server.users.find(u => u.id === recipientId);
                if (recipient) {
                    const block = await user.encryptAndSignBlock(message, recipient.kemKeys.publicKey);
                    block.recipientId = recipient.id;
                    block.documentId = doc.id;
                    await server.broadcastBlock(block);
                }
            }
        } else {
            const block = await user.encryptAndSignBlock(message, user.kemKeys.publicKey);
            block.recipientId = user.id;
            block.documentId = doc.id;
        }

        if (i > 0 && i % logFrequency === 0) {
            logDiv.innerHTML += `User ${user.id} completed ${i}/${totalEdits} edits<br>`;
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    }
    logDiv.innerHTML += `User ${user.id} completed all ${totalEdits} edits<br>`;
}

async function runSimulation(params = {}) {
    const numUsers = params.numUsers || DEFAULT_NUM_USERS;
    const numDocuments = params.numDocuments || DEFAULT_NUM_DOCUMENTS;
    const maxEditsPerUser = params.maxEditsPerUser || DEFAULT_MAX_EDITS_PER_USER;
    const logFrequency = params.logFrequency || DEFAULT_LOG_FREQUENCY;

    const outputDiv = document.getElementById("simulation-log");
    outputDiv.innerHTML = "Starting simulation...<br>";
    const resultsDiv = document.getElementById("results");
    resultsDiv.innerHTML = "";

    const users = [];
    outputDiv.innerHTML += "Initializing users...<br>";

    for (let i = 0; i < numUsers; i++) {
        const user = new User(i);
        await user.init();
        users.push(user);

        if (i % 5 === 0 || i === numUsers - 1) {
            outputDiv.innerHTML += `Initialized User ${i+1}/${numUsers}<br>`;
        }
    }

    const documents = [];
    for (let i = 0; i < numDocuments; i++) {
        documents.push(new Document(i));
    }

    outputDiv.innerHTML += `Creating ${numDocuments} documents and assigning editors...<br>`;
    assignEditorsToDocuments(users, documents);

    for (const doc of documents) {
        outputDiv.innerHTML += `Document ${doc.id} has ${doc.editors.size} editors<br>`;
    }

    const server = new DocumentServer(users);

    outputDiv.innerHTML += "<br>Starting user activity simulation:<br>";
    const userPromises = users.map(user => simulateUserActivity(
        user,
        documents,
        server,
        outputDiv,
        { maxEditsPerUser, logFrequency }
    ));

    await Promise.all(userPromises);

    outputDiv.innerHTML += "<br>Simulation completed.<br>";
    displayResults(users, documents, resultsDiv);

    return { users, documents };
}

function displayResults(users, documents, resultsDiv) {
    resultsDiv.innerHTML = '';

    // Document Statistics heading
    const docHeading = document.createElement('div');
    docHeading.className = 'section-heading';
    docHeading.innerHTML = "<h2>Document Statistics</h2>";
    resultsDiv.appendChild(docHeading);

    // Document cards container
    const docContainer = document.createElement('div');
    docContainer.className = 'cards-container';
    resultsDiv.appendChild(docContainer);

    documents.forEach(doc => {
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

    // User Performance heading
    const userHeading = document.createElement('div');
    userHeading.className = 'section-heading';
    userHeading.innerHTML = "<h2>User Cryptography Performance</h2>";
    resultsDiv.appendChild(userHeading);

    // User cards container
    const userContainer = document.createElement('div');
    userContainer.className = 'cards-container';
    resultsDiv.appendChild(userContainer);


    const activeUsers = users.filter(user => user.stats.length > 0);

    activeUsers.sort((a, b) => a.id - b.id).forEach(user => {
        const encryptStats = user.stats.filter(s => s.encryptTime > 0);
        const signStats = user.stats.filter(s => s.signTime > 0);
        const decryptStats = user.stats.filter(s => s.decryptTime > 0);
        const verifyStats = user.stats.filter(s => s.verifyTime > 0);

        const encryptTime = encryptStats.length > 0 ?
            encryptStats.reduce((a, b) => a + b.encryptTime, 0) / encryptStats.length : 0;
        const signTime = signStats.length > 0 ?
            signStats.reduce((a, b) => a + b.signTime, 0) / signStats.length : 0;
        const decryptTime = decryptStats.length > 0 ?
            decryptStats.reduce((a, b) => a + b.decryptTime, 0) / decryptStats.length : 0;
        const verifyTime = verifyStats.length > 0 ?
            verifyStats.reduce((a, b) => a + b.verifyTime, 0) / verifyStats.length : 0;

        const userCard = document.createElement('div');
        userCard.className = 'user-card';
        userCard.innerHTML = `
            <h3>User ${user.id}</h3>
            <div class="stat-row">
                <span class="stat-label">Encryption:</span>
                <span class="stat-value">${encryptTime.toFixed(2)} ms</span>
            </div>
            <div class="stat-row">
                <span class="stat-label">Signing:</span>
                <span class="stat-value">${signTime.toFixed(2)} ms</span>
            </div>
            <div class="stat-row">
                <span class="stat-label">Decryption:</span>
                <span class="stat-value">${decryptTime.toFixed(2)} ms</span>
            </div>
            <div class="stat-row">
                <span class="stat-label">Verification:</span>
                <span class="stat-value">${verifyTime.toFixed(2)} ms</span>
            </div>
        `;
        userContainer.appendChild(userCard);
    });
}

export { runSimulation };