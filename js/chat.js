/**
 * CasasBarinas - Chat Widget Module
 * Floating chat widget for buyer-seller communication
 */

(function () {
  'use strict';

  // ─── State ──────────────────────────────────────────────────
  let currentView = 'closed'; // closed | list | messages
  let conversations = [];
  let currentConversationId = null;
  let lastMessageId = 0;
  let pollInterval = null;
  let totalUnread = 0;
  let isOpen = false;

  // ─── Create Widget HTML ─────────────────────────────────────
  function createWidget() {
    if (document.getElementById('cbChatWidget')) return;

    const widget = document.createElement('div');
    widget.id = 'cbChatWidget';
    widget.innerHTML = `
      <!-- Chat Button (floating) -->
      <button class="cb-chat-btn" id="cbChatBtn" aria-label="Abrir chat">
        <i class="fas fa-comments"></i>
        <span class="cb-chat-badge" id="cbChatBadge" style="display:none;">0</span>
      </button>

      <!-- Chat Panel -->
      <div class="cb-chat-panel" id="cbChatPanel">
        <!-- Header -->
        <div class="cb-chat-header">
          <div class="cb-chat-header-left" id="cbChatHeaderLeft">
            <h3><i class="fas fa-comments"></i> Mensajes</h3>
          </div>
          <button class="cb-chat-header-back" id="cbChatBackBtn" style="display:none;">
            <i class="fas fa-arrow-left"></i>
          </button>
          <button class="cb-chat-header-close" id="cbChatCloseBtn">
            <i class="fas fa-times"></i>
          </button>
        </div>

        <!-- Conversations List View -->
        <div class="cb-chat-body" id="cbChatBody">
          <div class="cb-chat-list" id="cbChatListView">
            <div class="cb-chat-empty" id="cbChatEmptyList">
              <i class="fas fa-comment-dots"></i>
              <p>No tienes mensajes aun</p>
              <small>Visita una propiedad y haz clic en "Contactar" para iniciar una conversacion</small>
            </div>
          </div>

          <!-- Messages View -->
          <div class="cb-chat-messages hidden" id="cbChatMessagesView">
            <!-- Property info bar -->
            <div class="cb-chat-property-bar" id="cbChatPropertyBar"></div>
            <!-- Messages list -->
            <div class="cb-chat-messages-list" id="cbChatMessagesList"></div>
          </div>
        </div>

        <!-- Message Input (only in messages view) -->
        <div class="cb-chat-input-area hidden" id="cbChatInputArea">
          <div class="cb-chat-input-wrap">
            <textarea id="cbChatInput" placeholder="Escribe un mensaje..." rows="1" maxlength="2000"></textarea>
            <button class="cb-chat-send-btn" id="cbChatSendBtn" aria-label="Enviar">
              <i class="fas fa-paper-plane"></i>
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(widget);
    setupListeners();
  }

  // ─── Event Listeners ───────────────────────────────────────
  function setupListeners() {
    const chatBtn = document.getElementById('cbChatBtn');
    const closeBtn = document.getElementById('cbChatCloseBtn');
    const backBtn = document.getElementById('cbChatBackBtn');
    const sendBtn = document.getElementById('cbChatSendBtn');
    const input = document.getElementById('cbChatInput');

    if (chatBtn) chatBtn.addEventListener('click', toggleChat);
    if (closeBtn) closeBtn.addEventListener('click', closeChat);
    if (backBtn) backBtn.addEventListener('click', showConversationsList);
    if (sendBtn) sendBtn.addEventListener('click', sendMessage);

    if (input) {
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendMessage();
        }
      });
      // Auto-resize textarea
      input.addEventListener('input', function () {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 100) + 'px';
      });
    }
  }

  // ─── Toggle / Open / Close ─────────────────────────────────
  function toggleChat() {
    if (isOpen) {
      closeChat();
    } else {
      openChat();
    }
  }

  function openChat() {
    isOpen = true;
    const panel = document.getElementById('cbChatPanel');
    if (panel) panel.classList.add('cb-open');
    const btn = document.getElementById('cbChatBtn');
    if (btn) btn.classList.add('cb-active');

    if (currentView === 'closed' || currentView === 'list') {
      showConversationsList();
    }

    // Start polling if authenticated
    if (isAuthenticated() && !pollInterval) {
      startPolling();
    }
  }

  function closeChat() {
    isOpen = false;
    const panel = document.getElementById('cbChatPanel');
    if (panel) panel.classList.remove('cb-open');
    const btn = document.getElementById('cbChatBtn');
    if (btn) btn.classList.remove('cb-active');

    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  }

  // ─── Conversations List ────────────────────────────────────
  async function loadConversations() {
    if (!isAuthenticated()) return;

    try {
      const data = await api.get('/chat/conversations');
      conversations = data.conversations || [];
      totalUnread = data.total_unread || 0;
      updateBadge();
      renderConversationsList();
    } catch (error) {
      console.error('Error loading conversations:', error);
    }
  }

  function renderConversationsList() {
    const listView = document.getElementById('cbChatListView');
    const emptyList = document.getElementById('cbChatEmptyList');
    if (!listView) return;

    // Remove old conversation items
    listView.querySelectorAll('.cb-chat-conv-item').forEach(el => el.remove());

    if (conversations.length === 0) {
      if (emptyList) emptyList.style.display = '';
      return;
    }

    if (emptyList) emptyList.style.display = 'none';

    conversations.forEach(conv => {
      const item = document.createElement('div');
      item.className = 'cb-chat-conv-item';
      if (conv.unread > 0) item.classList.add('cb-unread');

      const timeStr = conv.last_message_at ? formatTime(conv.last_message_at) : '';
      const priceStr = conv.property && conv.property.price ? formatPrice(conv.property.price, conv.property.currency) : '';
      const imgSrc = conv.property && conv.property.image ? conv.property.image : '';

      item.innerHTML = `
        <div class="cb-conv-avatar">
          ${imgSrc ? `<img src="${imgSrc}" alt="" onerror="this.parentElement.innerHTML='<i class=\\'fas fa-home\\'></i>'">` : '<i class="fas fa-home"></i>'}
        </div>
        <div class="cb-conv-info">
          <div class="cb-conv-top">
            <span class="cb-conv-name">${conv.other_user ? conv.other_user.name : 'Usuario'}</span>
            <span class="cb-conv-time">${timeStr}</span>
          </div>
          <div class="cb-conv-prop">
            <span class="cb-conv-prop-title">${conv.property ? conv.property.title : 'Propiedad'}</span>
            ${priceStr ? `<span class="cb-conv-prop-price">${priceStr}</span>` : ''}
          </div>
          <div class="cb-conv-preview">
            <span class="cb-conv-text">${conv.last_message ? truncateText(conv.last_message, 50) : 'Sin mensajes'}</span>
            ${conv.unread > 0 ? `<span class="cb-conv-unread-badge">${conv.unread}</span>` : ''}
          </div>
        </div>
      `;

      item.addEventListener('click', () => openConversation(conv.id));
      listView.appendChild(item);
    });
  }

  function showConversationsList() {
    currentView = 'list';

    const listView = document.getElementById('cbChatListView');
    const messagesView = document.getElementById('cbChatMessagesView');
    const inputArea = document.getElementById('cbChatInputArea');
    const backBtn = document.getElementById('cbChatBackBtn');
    const headerLeft = document.getElementById('cbChatHeaderLeft');

    if (listView) listView.classList.remove('hidden');
    if (messagesView) messagesView.classList.add('hidden');
    if (inputArea) inputArea.classList.add('hidden');
    if (backBtn) backBtn.style.display = 'none';
    if (headerLeft) headerLeft.style.display = '';

    loadConversations();
  }

  // ─── Open Conversation & Messages ──────────────────────────
  async function openConversation(convId) {
    currentView = 'messages';
    currentConversationId = convId;
    lastMessageId = 0;

    const listView = document.getElementById('cbChatListView');
    const messagesView = document.getElementById('cbChatMessagesView');
    const inputArea = document.getElementById('cbChatInputArea');
    const backBtn = document.getElementById('cbChatBackBtn');
    const headerLeft = document.getElementById('cbChatHeaderLeft');

    if (listView) listView.classList.add('hidden');
    if (messagesView) messagesView.classList.remove('hidden');
    if (inputArea) inputArea.classList.remove('hidden');
    if (backBtn) backBtn.style.display = '';
    if (headerLeft) headerLeft.style.display = 'none';

    // Find conversation data
    const conv = conversations.find(c => c.id === convId);
    if (conv) {
      const propBar = document.getElementById('cbChatPropertyBar');
      if (propBar) {
        const name = conv.other_user ? conv.other_user.name : 'Vendedor';
        const role = conv.other_user && conv.other_user.role === 'seller' ? 'Vendedor' : 'Comprador';
        propBar.innerHTML = `
          <i class="fas fa-user"></i>
          <span>Chat con <strong>${name}</strong></span>
          <a href="property.html?id=${conv.property.id}" target="_blank" class="cb-prop-link">
            ${conv.property.title} ${conv.property.price ? '- ' + formatPrice(conv.property.price, conv.property.currency) : ''}
          </a>
        `;
      }
    }

    await loadMessages();
  }

  async function loadMessages() {
    if (!currentConversationId) return;

    try {
      const url = lastMessageId > 0
        ? `/chat/messages/${currentConversationId}?after_id=${lastMessageId}`
        : `/chat/messages/${currentConversationId}`;

      const data = await api.get(url);
      const messages = data.messages || [];

      if (messages.length > 0) {
        lastMessageId = messages[messages.length - 1].id;
        renderMessages(messages);
      }

      scrollToBottom();
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  }

  function renderMessages(messages) {
    const list = document.getElementById('cbChatMessagesList');
    if (!list) return;

    messages.forEach(msg => {
      const bubble = document.createElement('div');
      bubble.className = 'cb-msg-bubble' + (msg.is_mine ? ' cb-msg-mine' : ' cb-msg-other');

      const time = msg.created_at ? formatTime(msg.created_at) : '';
      const readIcon = msg.is_mine && msg.is_read ? '<i class="fas fa-check-double cb-msg-read"></i>' :
                        msg.is_mine ? '<i class="fas fa-check cb-msg-read"></i>' : '';

      bubble.innerHTML = `
        <div class="cb-msg-content">${escapeHTML(msg.content)}</div>
        <div class="cb-msg-meta">
          <span class="cb-msg-time">${time}</span>
          ${readIcon}
        </div>
      `;

      list.appendChild(bubble);
    });
  }

  // ─── Send Message ──────────────────────────────────────────
  async function sendMessage() {
    const input = document.getElementById('cbChatInput');
    if (!input || !currentConversationId) return;

    const content = input.value.trim();
    if (!content) return;

    input.value = '';
    input.style.height = 'auto';

    // Optimistic render
    const list = document.getElementById('cbChatMessagesList');
    if (list) {
      const bubble = document.createElement('div');
      bubble.className = 'cb-msg-bubble cb-msg-mine cb-msg-sending';
      bubble.innerHTML = `
        <div class="cb-msg-content">${escapeHTML(content)}</div>
        <div class="cb-msg-meta"><span class="cb-msg-time">Enviando...</span></div>
      `;
      list.appendChild(bubble);
      scrollToBottom();
    }

    try {
      const data = await api.post(`/chat/messages/${currentConversationId}`, { content });
      // Update the sending bubble
      const sendingBubble = list?.querySelector('.cb-msg-sending');
      if (sendingBubble && data.message) {
        sendingBubble.classList.remove('cb-msg-sending');
        const time = data.message.created_at ? formatTime(data.message.created_at) : 'Ahora';
        sendingBubble.innerHTML = `
          <div class="cb-msg-content">${escapeHTML(content)}</div>
          <div class="cb-msg-meta"><span class="cb-msg-time">${time}</span><i class="fas fa-check cb-msg-read"></i></div>
        `;
      }
      lastMessageId = data.message?.id || lastMessageId;
    } catch (error) {
      showToast('Error al enviar mensaje', 'error');
      const sendingBubble = list?.querySelector('.cb-msg-sending');
      if (sendingBubble) {
        sendingBubble.classList.remove('cb-msg-sending');
        sendingBubble.classList.add('cb-msg-error');
        sendingBubble.querySelector('.cb-msg-time').textContent = 'Error - Toca para reenviar';
      }
    }
  }

  // ─── Polling ───────────────────────────────────────────────
  function startPolling() {
    if (pollInterval) clearInterval(pollInterval);
    // Poll every 5 seconds
    pollInterval = setInterval(async () => {
      if (!isOpen) return;
      try {
        if (currentView === 'messages' && currentConversationId) {
          await loadMessages();
        } else {
          await loadConversations();
        }
      } catch (e) {
        // silently ignore
      }
    }, 5000);
  }

  // ─── Unread Badge ──────────────────────────────────────────
  function updateBadge() {
    const badge = document.getElementById('cbChatBadge');
    if (!badge) return;

    if (totalUnread > 0) {
      badge.style.display = '';
      badge.textContent = totalUnread > 99 ? '99+' : totalUnread;
    } else {
      badge.style.display = 'none';
    }
  }

  // ─── Public API ────────────────────────────────────────────
  // Open chat directly to a specific property's conversation
  window.CasasBarinasChat = {
    async openChatWith(propertyId, message) {
      if (!isAuthenticated()) {
        const redirect = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.href = `login.html?redirect=${redirect}`;
        return;
      }

      createWidget();
      openChat();

      try {
        const data = await api.post('/chat/conversations', {
          property_id: propertyId,
          initial_message: message || '',
        });

        if (data.conversation) {
          // Prepend to conversations
          const existsIdx = conversations.findIndex(c => c.id === data.conversation.id);
          if (existsIdx >= 0) conversations.splice(existsIdx, 1);
          conversations.unshift(data.conversation);
          await openConversation(data.conversation.id);

          // Pre-fill input if no initial message was sent
          if (!message) {
            const input = document.getElementById('cbChatInput');
            if (input) input.focus();
          }
        }
      } catch (error) {
        showToast(error.message || 'Error al iniciar conversacion', 'error');
      }
    },

    init() {
      createWidget();
      // Load unread count if authenticated
      if (isAuthenticated()) {
        api.get('/chat/conversations').then(data => {
          totalUnread = data.total_unread || 0;
          updateBadge();
        }).catch(() => {});
      }
    },
  };

  // ─── Helpers ───────────────────────────────────────────────
  function scrollToBottom() {
    const list = document.getElementById('cbChatMessagesList');
    if (list) {
      requestAnimationFrame(() => {
        list.scrollTop = list.scrollHeight;
      });
    }
  }

  function formatTime(dateStr) {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diff = now - date;

      if (diff < 60000) return 'Ahora';
      if (diff < 3600000) return Math.floor(diff / 60000) + 'm';
      if (diff < 86400000) return date.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });

      // Different date
      if (diff < 604800000) {
        const days = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
        return days[date.getDay()];
      }

      return date.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit' });
    } catch {
      return '';
    }
  }

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ─── Auto-init if not on login/admin pages ─────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    // Don't show chat on login or admin pages
    const path = window.location.pathname;
    if (path.includes('login') || path.includes('admin')) return;

    window.CasasBarinasChat.init();
  }
})();
