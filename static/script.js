document.addEventListener('DOMContentLoaded', () => {
    const chatContainer = document.getElementById('chat-container');
    const userInput = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');
    const sidebar = document.getElementById('sidebar');
    const menuBtn = document.getElementById('menu-btn');
    const welcomeScreen = document.getElementById('welcome-screen');
    const historyList = document.querySelector('.history-list');
    const newChatBtn = document.querySelector('.new-chat-btn');

    let isGenerating = false;
    let currentSessionId = null;

    // Load history on startup
    loadHistory();

    // New Chat Button Logic
    if (newChatBtn) {
        newChatBtn.addEventListener('click', startNewChat);
    }

    // Also handle the "New Chat" span in mobile nav if needed, checking if it acts as button
    // The HTML shows <span>New Chat</span> in mobile-nav, but it doesn't look clickable by default in original code
    // Let's make sure the mobile new chat also works if the user intended it
    const mobileNewChat = document.querySelector('.mobile-nav span');
    if (mobileNewChat) {
        mobileNewChat.style.cursor = 'pointer';
        mobileNewChat.addEventListener('click', startNewChat);
    }

    function startNewChat() {
        currentSessionId = null;
        chatContainer.innerHTML = '';
        chatContainer.appendChild(welcomeScreen);
        welcomeScreen.style.display = 'block'; // Show welcome screen
        userInput.value = '';
        userInput.style.height = '24px';
        loadHistory(); // Refresh history to show the last session if it wasn't there

        // On mobile, close sidebar if open
        if (window.innerWidth <= 768) {
            sidebar.classList.remove('open');
        }
    }

    async function loadHistory() {
        try {
            const response = await fetch('/history');
            const sessions = await response.json();
            historyList.innerHTML = ''; // Clear current list

            sessions.forEach(session => {
                const item = document.createElement('div');
                item.className = 'history-item'; // You might need to add CSS for this
                item.innerText = session.title;
                item.onclick = () => loadSession(session.id);
                historyList.appendChild(item);
            });
        } catch (error) {
            console.error('Error loading history:', error);
        }
    }

    async function loadSession(sessionId) {
        try {
            const response = await fetch(`/history/${sessionId}`);
            const messages = await response.json();

            currentSessionId = sessionId;
            chatContainer.innerHTML = ''; // Clear chat
            // Welcome screen is already in chatContainer but cleared. 
            // We can re-append it hidden if we want to keep structure, or just ignore it for old chats.

            messages.forEach(msg => {
                appendMessage(msg.sender, msg.content);
            });

            // On mobile, close sidebar
            if (window.innerWidth <= 768) {
                sidebar.classList.remove('open');
            }

        } catch (error) {
            console.error('Error loading session:', error);
        }
    }

    // Auto-resize input
    userInput.addEventListener('input', function () {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
        if (this.value === '') this.style.height = '24px';
    });

    // Handle Enter key (Shift+Enter for new line)
    userInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // Handle Send Button
    sendBtn.addEventListener('click', sendMessage);

    // Mobile menu toggle
    if (menuBtn) {
        menuBtn.addEventListener('click', () => {
            sidebar.classList.toggle('open');
        });
    }

    // Close sidebar when clicking outside on mobile
    document.addEventListener('click', (e) => {
        if (window.innerWidth <= 768) {
            if (!sidebar.contains(e.target) && !menuBtn.contains(e.target) && sidebar.classList.contains('open')) {
                sidebar.classList.remove('open');
            }
        }
    });

    async function sendMessage() {
        const message = userInput.value.trim();
        if (!message || isGenerating) return;

        // Hide welcome screen if visible
        // Since we might have cleared chatContainer, we should check if welcomeScreen is still in DOM or just hide it if we can find it
        // If we cleared HTML, welcomeScreen is gone from DOM. 
        // But if we just started, it's there.
        const currentWelcome = document.getElementById('welcome-screen');
        if (currentWelcome) {
            currentWelcome.style.display = 'none';
        }

        // Reset input
        userInput.value = '';
        userInput.style.height = '24px';
        isGenerating = true;
        updateSendButtonState();

        // Append User Message
        appendMessage('user', message);

        // Show Typing Indicator
        const typingIndicatorId = appendTypingIndicator();

        try {
            const response = await fetch('/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: message,
                    session_id: currentSessionId
                })
            });

            // Remove typing indicator
            removeMessage(typingIndicatorId);

            if (!response.ok) {
                throw new Error('Network response was not ok');
            }

            const data = await response.json();

            // Update session ID if it's new
            if (data.session_id) {
                if (currentSessionId !== data.session_id) {
                    currentSessionId = data.session_id;
                    loadHistory(); // Refresh sidebar to show new chat
                }
            }

            // Append Bot Message
            appendMessage('bot', data.reply);

        } catch (error) {
            removeMessage(typingIndicatorId);
            appendMessage('bot', "Sorry, something went wrong. Please try again.");
            console.error('Error:', error);
        } finally {
            isGenerating = false;
            updateSendButtonState();
        }
    }

    function appendMessage(sender, text) {
        const wrapper = document.createElement('div');
        wrapper.className = `message-wrapper ${sender}`;

        // Avatar
        const avatar = document.createElement('div');
        avatar.className = `avatar ${sender}-avatar`;
        // Simple SVG icons
        if (sender === 'user') {
            avatar.innerHTML = `<svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;
        } else {
            avatar.innerHTML = `<svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="11" width="18" height="10" rx="2"></rect><circle cx="12" cy="5" r="2"></circle><path d="M12 7v4"></path><line x1="8" y1="16" x2="8" y2="16"></line><line x1="16" y1="16" x2="16" y2="16"></line></svg>`;
        }

        // Content
        const content = document.createElement('div');
        content.className = 'message-content';

        const textDiv = document.createElement('div');
        textDiv.className = 'text-content';
        textDiv.innerText = text;

        content.appendChild(avatar);
        content.appendChild(textDiv);
        wrapper.appendChild(content);

        chatContainer.appendChild(wrapper);
        scrollToBottom();
    }

    function appendTypingIndicator() {
        const id = 'typing-' + Date.now();
        const wrapper = document.createElement('div');
        wrapper.className = 'message-wrapper bot';
        wrapper.id = id;

        const content = document.createElement('div');
        content.className = 'message-content';

        const avatar = document.createElement('div');
        avatar.className = 'avatar bot-avatar';
        avatar.innerHTML = `<svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="11" width="18" height="10" rx="2"></rect><circle cx="12" cy="5" r="2"></circle><path d="M12 7v4"></path><line x1="8" y1="16" x2="8" y2="16"></line><line x1="16" y1="16" x2="16" y2="16"></line></svg>`;

        const indicator = document.createElement('div');
        indicator.className = 'typing-indicator';
        indicator.innerHTML = '<div class="dot"></div><div class="dot"></div><div class="dot"></div>';

        content.appendChild(avatar);
        content.appendChild(indicator);
        wrapper.appendChild(content);

        chatContainer.appendChild(wrapper);
        scrollToBottom();
        return id;
    }

    function removeMessage(id) {
        const el = document.getElementById(id);
        if (el) el.remove();
    }

    function scrollToBottom() {
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    function updateSendButtonState() {
        if (isGenerating) {
            sendBtn.disabled = true;
            sendBtn.innerHTML = '<div class="dot" style="background-color: #8e8ea0; width: 4px; height: 4px;"></div><div class="dot" style="background-color: #8e8ea0; width: 4px; height: 4px; animation-delay: 0.2s;"></div><div class="dot" style="background-color: #8e8ea0; width: 4px; height: 4px; animation-delay: 0.4s;"></div>'; // Simple loading state
        } else {
            sendBtn.disabled = false;
            sendBtn.innerHTML = `<svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>`;
        }
    }
});
