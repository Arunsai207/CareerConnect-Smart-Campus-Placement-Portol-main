document.addEventListener('DOMContentLoaded', () => {
  if (document.querySelector('.career-chatbot')) return;

  const widget = document.createElement('div');
  widget.className = 'career-chatbot';
  widget.innerHTML = `
    <div class="chatbot-panel" id="careerChatPanel">
      <div class="chatbot-header">
        <div class="chatbot-title">Career Coach AI</div>
        <button type="button" class="chatbot-close" aria-label="Close chat">×</button>
      </div>
      <div class="chatbot-body" id="careerChatBody">
        <div class="chat-msg ai">Hi! I can help with resumes, coding, study questions, interview prep, career advice, and general questions.</div>
      </div>
      <div class="chat-suggestions">
        <button class="suggestion-chip" type="button">Explain machine learning</button>
        <button class="suggestion-chip" type="button">Improve my resume</button>
        <button class="suggestion-chip" type="button">Career roadmap</button>
      </div>
      <form class="chatbot-form" id="careerChatForm">
        <input id="careerChatInput" class="chatbot-input" type="text" placeholder="Ask me anything..." autocomplete="off" />
        <button class="chatbot-send" type="submit">Send</button>
      </form>
    </div>
    <button type="button" class="chatbot-fab" aria-label="Open career assistant">AI</button>
  `;

  document.body.appendChild(widget);

  const panel = widget.querySelector('#careerChatPanel');
  const body = widget.querySelector('#careerChatBody');
  const form = widget.querySelector('#careerChatForm');
  const input = widget.querySelector('#careerChatInput');
  const toggle = widget.querySelector('.chatbot-fab');
  const closeBtn = widget.querySelector('.chatbot-close');
  const conversation = [];

  function appendMessage(text, sender = 'ai') {
    const message = document.createElement('div');
    message.className = `chat-msg ${sender}`;
    message.textContent = text;
    body.appendChild(message);
    body.scrollTop = body.scrollHeight;
  }

  function openChat() {
    panel.classList.add('open');
    input.focus();
  }

  function closeChat() {
    panel.classList.remove('open');
  }

  toggle.addEventListener('click', () => {
    const isOpen = panel.classList.contains('open');
    if (isOpen) closeChat();
    else openChat();
  });

  closeBtn.addEventListener('click', closeChat);

  widget.querySelectorAll('.suggestion-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      input.value = chip.textContent.trim();
      form.requestSubmit();
    });
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const value = input.value.trim();
    if (!value) return;

    conversation.push({ role: 'user', content: value });
    appendMessage(value, 'user');
    input.value = '';

    const sendButton = form.querySelector('.chatbot-send');
    sendButton.disabled = true;
    sendButton.textContent = '…';

    try {
      const response = await fetch('/api/chatbot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: conversation.slice(-12) })
      });

      const data = await response.json();
      const reply = data?.text || 'I could not generate a response right now. Please try again.';
      conversation.push({ role: 'assistant', content: reply });
      appendMessage(reply, 'ai');
    } catch (error) {
      appendMessage('I am temporarily unavailable. Please try again in a moment.', 'ai');
      console.error('Career chatbot error:', error);
    } finally {
      sendButton.disabled = false;
      sendButton.textContent = 'Send';
    }
  });
});
