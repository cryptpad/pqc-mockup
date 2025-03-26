import { User } from './User.js';
import { DocumentServer } from './DocumentServer.js';

const NUM_USERS = 5;

async function runSimulation() {
    const outputDiv = document.getElementById("output");
    outputDiv.innerHTML = "Starting simulation...<br>";

    const users = [];
    outputDiv.innerHTML += "Initializing users...<br>";

    for (let i = 0; i < NUM_USERS; i++) {
        const user = new User(i);
        await user.init();
        users.push(user);
        outputDiv.innerHTML += `Initialized User ${i}<br>`;
    }

    const server = new DocumentServer(users);

    outputDiv.innerHTML += "<br>Starting message exchange:<br>";
    for (const sender of users) {
        const message = `Message from User ${sender.id}`;
        outputDiv.innerHTML += `User ${sender.id} sending message to ${NUM_USERS-1} recipients<br>`;

        for (const recipient of users) {
            if (sender.id !== recipient.id) {
                outputDiv.innerHTML += `- Creating message for User ${recipient.id}<br>`;
                const block = await sender.encryptAndSignBlock(message, recipient.kemKeys.publicKey);
                block.recipientId = recipient.id;
                await server.broadcastBlock(block);
            }
        }
    }

    outputDiv.innerHTML += "<br>Results:<br>";
    users.forEach((u) => {
        const avgEncryptTime = u.stats.reduce((a, b) => a + (b.encryptTime || 0), 0) / u.stats.length;
        const avgSignTime = u.stats.reduce((a, b) => a + (b.signTime || 0), 0) / u.stats.length;
        const avgDecryptTime = u.stats.reduce((a, b) => a + (b.decryptTime || 0), 0) / u.stats.length;
        const avgVerifyTime = u.stats.reduce((a, b) => a + (b.verifyTime || 0), 0) / u.stats.length;

        outputDiv.innerHTML += `<p>User ${u.id} avg encrypt time: ${avgEncryptTime.toFixed(2)}ms</p>`;
        outputDiv.innerHTML += `<p>User ${u.id} avg sign time: ${avgSignTime.toFixed(2)}ms</p>`;
        outputDiv.innerHTML += `<p>User ${u.id} avg decrypt time: ${avgDecryptTime.toFixed(2)}ms</p>`;
        outputDiv.innerHTML += `<p>User ${u.id} avg verify time: ${avgVerifyTime.toFixed(2)}ms</p>`;
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const startButton = document.getElementById('startButton');
    startButton.addEventListener('click', () => {
        startButton.disabled = true;
        runSimulation().then(() => {
            startButton.disabled = false;
        }).catch((error) => {
            console.error('Simulation failed:', error);
            startButton.disabled = false;
        });
    });
});
