// public/script.js
// =============================================
// IP Chat Name - Frontend Logic
// Beginner-friendly + heavily commented
// =============================================

let socket;
let currentRoomId = null;
let myNickname = '';
let myIP = '';
let participants = [];
let messages = [];

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    console.log('%c🚀 IP Chat Name frontend started!', 'color:#00f0ff; font-size:18px;');

    socket = io();

    setupSocketListeners();

    // Check if user opened a direct room link (e.g. ?room=ABC12345)
    const params = new URLSearchParams(window.location.search);
    if (params.has('room')) {
        currentRoomId = params.get('room').toUpperCase();
        showJoinModal();
    }
});

function setupSocketListeners() {
    socket.on('connect', () => console.log('✅ Socket connected'));

    socket.on('room-joined', (data) => {
        currentRoomId = data.roomId;
        myNickname = data.myNickname;
        myIP = data.myIP;
        participants = data.users;
        messages = data.messages || [];

        history.pushState({}, '', `?room=${currentRoomId}`);

        switchToChatView();
        renderParticipants();
        renderMessages();

        if (participants.length === 2) {
            document.getElementById('waiting-banner').classList.add('hidden');
        }
        showToast('✅ Connected to room!', 2500);
    });

    socket.on('user-joined', (data) => {
        participants = data.users;
        renderParticipants();
        document.getElementById('waiting-banner').classList.add('hidden');
        showToast(`${data.nickname} joined from ${data.ip}`, 3000);
    });

    socket.on('receive-message', (msg) => {
        messages.push(msg);
        renderMessages();
        const container = document.getElementById('chat-messages');
        container.scrollTop = container.scrollHeight;
    });

    socket.on('room-closed', (data) => {
        showClosedModal(data.reason || 'The other user left. Room permanently deleted.');
    });

    socket.on('room-error', (data) => {
        showToast(`❌ ${data.msg}`, 4000);
        const modal = document.getElementById('join-modal');
        if (modal && !modal.classList.contains('hidden')) modal.classList.add('hidden');
    });
}

function createRoom() {
    const nickname = document.getElementById('nickname-input').value.trim();
    if (!nickname) return showToast('Please enter a nickname!', 3000);
    myNickname = nickname;
    socket.emit('create-room', { nickname });
}

function joinRoomFromHome() {
    const roomId = document.getElementById('room-code-input').value.trim().toUpperCase();
    const nickname = document.getElementById('nickname-input').value.trim();
    if (!roomId || roomId.length < 6) return showToast('Enter a valid Room ID', 3000);
    if (!nickname) return showToast('Please enter a nickname!', 3000);
    myNickname = nickname;
    currentRoomId = roomId;
    socket.emit('join-room', { roomId, nickname });
}

function showJoinModal() {
    const modal = document.getElementById('join-modal');
    document.getElementById('modal-room-id').textContent = currentRoomId;
    modal.classList.remove('hidden');
    setTimeout(() => document.getElementById('modal-nickname').focus(), 300);
}

function confirmJoinFromModal() {
    myNickname = document.getElementById('modal-nickname').value.trim() || 'Anonymous';
    document.getElementById('join-modal').classList.add('hidden');
    socket.emit('join-room', { roomId: currentRoomId, nickname: myNickname });
}

function cancelJoinModal() {
    document.getElementById('join-modal').classList.add('hidden');
    currentRoomId = null;
}

function switchToChatView() {
    document.getElementById('home-view').classList.add('hidden');
    document.getElementById('chat-view').classList.remove('hidden');
    document.getElementById('header-room-info').classList.remove('hidden');
    document.getElementById('room-id-display').textContent = currentRoomId;
}

function renderParticipants() {
    const container = document.getElementById('participants-list');
    container.innerHTML = '';
    document.getElementById('participant-count').textContent = `${participants.length}/2`;

    participants.forEach(user => {
        const isMe = user.nickname === myNickname;
        const div = document.createElement('div');
        div.className = `participant ${isMe ? 'me' : ''}`;
        div.innerHTML = `
            <div class="participant-info">
                <div class="participant-name">${isMe ? '👤 You' : '👤 ' + user.nickname}</div>
                <div class="participant-ip">IP: ${user.ip}</div>
            </div>
        `;
        container.appendChild(div);
    });

    if (participants.length === 1) {
        document.getElementById('waiting-banner').classList.remove('hidden');
    }
}

function renderMessages() {
    const container = document.getElementById('chat-messages');
    const empty = document.getElementById('empty-chat');
    if (messages.length > 0) empty.style.display = 'none';

    container.querySelectorAll('.message').forEach(el => el.remove());

    messages.forEach(msg => {
        const isMine = msg.sender === myNickname;
        const div = document.createElement('div');
        div.className = `message ${isMine ? 'you' : 'other'}`;
        div.innerHTML = `
            <div class="message-header">
                <span class="message-sender">${isMine ? 'You' : msg.sender}</span>
                <span class="message-ip">• ${msg.ip}</span>
                <span class="message-time">${msg.time}</span>
            </div>
            <div>${msg.text}</div>
        `;
        container.appendChild(div);
    });

    container.scrollTop = container.scrollHeight;
}

function sendMessage(e) {
    e.preventDefault();
    const input = document.getElementById('message-input');
    const text = input.value.trim();
    if (!text || !currentRoomId) return;
    socket.emit('send-message', { text });
    input.value = '';
}

function copyRoomLink() {
    const link = `${window.location.origin}?room=${currentRoomId}`;
    navigator.clipboard.writeText(link).then(() => showToast('✅ Link copied!', 2500));
}

function showClosedModal(reason) {
    const modal = document.getElementById('closed-modal');
    document.getElementById('closed-reason').innerHTML = `${reason}<br><br><small>This room ID can never be used again.</small>`;
    modal.classList.remove('hidden');
}

function goBackToHome() {
    document.getElementById('closed-modal').classList.add('hidden');
    document.getElementById('chat-view').classList.add('hidden');
    document.getElementById('home-view').classList.remove('hidden');
    document.getElementById('header-room-info').classList.add('hidden');
    currentRoomId = null;
    participants = [];
    messages = [];
}

function showToast(message, timeout = 3000) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), timeout);
          }
