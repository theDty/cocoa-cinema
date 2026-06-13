const socket = io();

const shareBtn = document.getElementById('share-btn');
const videoPlayer = document.getElementById('video-player');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const fullscreenBtn = document.getElementById('fullscreen-btn');
const localUserNameEl = document.getElementById('local-user-name');
const remoteUserNameEl = document.getElementById('remote-user-name');

const urlParams = new URLSearchParams(window.location.search);
const localName = urlParams.get('username');

if (!localName) {
    window.location.href = '/lobby.html';
}

if (localUserNameEl) {
    localUserNameEl.textContent = localName;
}
const localInitialEl = document.getElementById('local-user-initial');
if (localInitialEl && localName) {
    localInitialEl.textContent = localName.charAt(0).toUpperCase();
}

const peerConnections = {};
let localStream;

const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
    ]
};

function getPeerConnection(peerId) {
    if (peerConnections[peerId]) return peerConnections[peerId];
    
    const pc = new RTCPeerConnection(configuration);
    peerConnections[peerId] = pc;

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', event.candidate, peerId);
        }
    };

    pc.ontrack = (event) => {
        videoPlayer.srcObject = event.streams[0];
        videoPlayer.play().catch(err => console.log('Autoplay blocked:', err));
    };
    
    return pc;
}

// 1. Broadcaster ready event
socket.on('broadcaster-ready', (broadcasterId) => {
    // Viewer receives this, requests to watch
    if (!localStream) {
        socket.emit('watcher-request', broadcasterId);
    }
});

// 2. Watcher request event (only broadcaster receives this)
socket.on('watcher-request', async (watcherId) => {
    if (!window.localStream && !localStream) return;
    
    const pc = getPeerConnection(watcherId);
    
    if (window.localStream) {
        window.localStream.getTracks().forEach(track => {
            pc.addTrack(track, window.localStream);
        });
    } else if (localStream) {
        localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream);
        });
    }
    
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('offer', offer, watcherId);
});

// Peer disconnected: hide slot and cleanup connection
socket.on('peer-disconnected', (data) => {
    const peerId = data.peerId;
    if (peerConnections[peerId]) {
        peerConnections[peerId].close();
        delete peerConnections[peerId];
    }
    
    // In our 1-on-1 UI, hide remote container
    const remoteUserContainer = document.getElementById('remote-user-container');
    if (remoteUserContainer) remoteUserContainer.style.display = 'none';
    
    if (videoPlayer && !localStream) {
        videoPlayer.srcObject = null;
    }
});

// Identity Exchange
socket.emit('offer', { type: 'identity', name: localName });

// Signaling
socket.on('offer', async (peerId, data) => {
    if (data.type === 'identity') {
        if (remoteUserNameEl && data.name) {
            remoteUserNameEl.textContent = data.name;
            const remoteInitialEl = document.getElementById('remote-user-initial');
            if (remoteInitialEl) remoteInitialEl.textContent = data.name.charAt(0).toUpperCase();
            const remoteUserContainer = document.getElementById('remote-user-container');
            if (remoteUserContainer) remoteUserContainer.style.display = 'flex';
        }
        socket.emit('answer', { type: 'identity', name: localName }, peerId);
        return;
    }
    const pc = getPeerConnection(peerId);
    await pc.setRemoteDescription(new RTCSessionDescription(data));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit('answer', answer, peerId);
});

socket.on('answer', async (peerId, data) => {
    if (data.type === 'identity') {
        if (remoteUserNameEl && data.name) {
            remoteUserNameEl.textContent = data.name;
            const remoteInitialEl = document.getElementById('remote-user-initial');
            if (remoteInitialEl) remoteInitialEl.textContent = data.name.charAt(0).toUpperCase();
            const remoteUserContainer = document.getElementById('remote-user-container');
            if (remoteUserContainer) remoteUserContainer.style.display = 'flex';
        }
        return;
    }
    const pc = getPeerConnection(peerId);
    await pc.setRemoteDescription(new RTCSessionDescription(data));
});

socket.on('ice-candidate', async (peerId, candidate) => {
    const pc = getPeerConnection(peerId);
    try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
        console.error('Error adding received ice candidate', e);
    }
});

// Screen Sharing
if (shareBtn) {
    shareBtn.addEventListener('click', async () => {
        try {
            localStream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: true
            });
            window.localStream = localStream; // Expose globally to guarantee availability
            
            videoPlayer.srcObject = localStream;
            videoPlayer.muted = true;
            
            // Notify server that this socket is the active broadcaster
            socket.emit('broadcaster-ready');
            
            localStream.getVideoTracks()[0].onended = () => {
                videoPlayer.srcObject = null;
                localStream = null;
                window.localStream = null;
            };
            
        } catch (err) {
            console.error("Error accessing display media: ", err);
        }
    });
}

// Chat UI Logic
function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}

function appendMessage(text, isLocal) {
    const wrapperDiv = document.createElement('div');
    
    if (isLocal) {
        // Sent Message (Host) - Ivory Bubble
        wrapperDiv.className = "flex gap-2 items-end self-end max-w-[85%]";
        wrapperDiv.innerHTML = `
            <div class="bg-[#F9F6EE] text-[#1A0F0D] px-4 py-2 rounded-[24px] rounded-br-sm shadow-[0_2px_10px_rgba(249,246,238,0.1)] border border-[#e5e2db] break-words">
                <p>${escapeHTML(text)}</p>
            </div>
        `;
    } else {
        // Received Message (Guest) - Deep Cocoa Bubble
        wrapperDiv.className = "flex gap-2 items-end self-start max-w-[85%]";
        wrapperDiv.innerHTML = `
            <div class="w-6 h-6 rounded-full bg-[#40231B] text-primary flex items-center justify-center shrink-0 mb-1 font-label-sm overflow-hidden">
                <span class="material-symbols-outlined" style="font-size: 14px;">person</span>
            </div>
            <div class="bg-[#40231B] text-[#F9F6EE] px-4 py-2 rounded-[24px] rounded-bl-sm shadow-sm border border-surface-container-high break-words">
                <p>${escapeHTML(text)}</p>
            </div>
        `;
    }
    
    if (chatMessages) {
        chatMessages.appendChild(wrapperDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
}

function sendMessage() {
    if (!chatInput) return;
    const text = chatInput.value.trim();
    if (text) {
        // Emit the text AND the senderId so we can style local/remote bubbles correctly
        socket.emit('chat-message', { text: text, senderId: socket.id });
        chatInput.value = '';
    }
}

if (sendBtn) {
    sendBtn.addEventListener('click', sendMessage);
}
if (chatInput) {
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });
}

socket.on('chat-message', (data) => {
    // Determine if the message is from our own local socket
    const isLocal = typeof data === 'object' ? data.senderId === socket.id : false;
    const text = typeof data === 'object' ? data.text : data;
    appendMessage(text, isLocal);
});

// Fullscreen Logic
if (fullscreenBtn && videoPlayer) {
    fullscreenBtn.addEventListener('click', () => {
        if (videoPlayer.requestFullscreen) {
            videoPlayer.requestFullscreen();
        } else if (videoPlayer.webkitRequestFullscreen) {
            videoPlayer.webkitRequestFullscreen();
        } else if (videoPlayer.msRequestFullscreen) {
            videoPlayer.msRequestFullscreen();
        }
    });
}

const playPauseBtn = document.getElementById('play-pause-btn');
const playIcon = document.getElementById('play-icon');
const volumeBtn = document.getElementById('volume-btn');
const volumeIcon = document.getElementById('volume-icon');

if (videoPlayer) {
    videoPlayer.addEventListener('play', () => {
        if (playIcon) playIcon.textContent = 'pause';
    });
    
    videoPlayer.addEventListener('pause', () => {
        if (playIcon) playIcon.textContent = 'play_arrow';
    });
}

if (playPauseBtn && videoPlayer) {
    playPauseBtn.addEventListener('click', () => {
        if (videoPlayer.paused) {
            videoPlayer.play().catch(err => console.log('Autoplay blocked:', err));
        } else {
            videoPlayer.pause();
        }
    });
}

if (volumeBtn && videoPlayer) {
    volumeBtn.addEventListener('click', () => {
        videoPlayer.muted = !videoPlayer.muted;
        if (volumeIcon) {
            volumeIcon.textContent = videoPlayer.muted ? 'volume_off' : 'volume_up';
        }
    });
}
