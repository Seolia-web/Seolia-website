(function () {
    'use strict';

    var BRAND_COLOR = '#0D1B2A';
    var BRAND_YELLOW = '#FFD600';
    var BOT_NAME = 'Assistant ElectroMax ⚡';

    var responses = [
        {
            keywords: ['devis', 'prix', 'tarif', 'coût', 'cout', 'combien', 'budget'],
            reply: 'Je peux vous faire un devis gratuit sous 24h ! Appelez le +32 470 00 00 00 ou envoyez-nous un message WhatsApp.'
        },
        {
            keywords: ['urgence', 'urgent', 'panne', 'coupure', 'court-circuit'],
            reply: 'Nous intervenons en urgence 7j/7 ! Appelez immédiatement le +32 470 00 00 00'
        },
        {
            keywords: ['horaire', 'disponible', 'heure', 'ouvert', 'quand'],
            reply: 'Nous sommes disponibles du lundi au samedi de 7h à 19h, et en urgence 7j/7.'
        },
        {
            keywords: ['zone', 'liège', 'liege', 'secteur', 'région', 'region', 'où', 'seraing', 'herstal'],
            reply: 'Nous intervenons à Liège et dans toute la province : Seraing, Herstal, Ans, Fléron, et plus.'
        }
    ];

    var defaultReply = 'Merci pour votre message ! Pour une réponse rapide, appelez-nous au +32 470 00 00 00 ou utilisez WhatsApp.';

    function getReply(message) {
        var lower = message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        for (var i = 0; i < responses.length; i++) {
            for (var j = 0; j < responses[i].keywords.length; j++) {
                var keyword = responses[i].keywords[j].normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                if (lower.indexOf(keyword) !== -1) {
                    return responses[i].reply;
                }
            }
        }
        return defaultReply;
    }

    function injectStyles() {
        var css = [
            '#emx-chatbot-btn {',
            '  position: fixed; bottom: 24px; right: 24px; z-index: 9999;',
            '  width: 56px; height: 56px; border-radius: 50%;',
            '  background: ' + BRAND_COLOR + '; color: #fff; border: none;',
            '  cursor: pointer; box-shadow: 0 4px 16px rgba(0,0,0,0.25);',
            '  display: flex; align-items: center; justify-content: center;',
            '  transition: transform 0.3s ease, box-shadow 0.3s ease;',
            '}',
            '#emx-chatbot-btn:hover { transform: scale(1.08); box-shadow: 0 6px 24px rgba(0,0,0,0.3); }',
            '#emx-chatbot-btn svg { width: 26px; height: 26px; }',

            '#emx-chatbot-panel {',
            '  position: fixed; bottom: 92px; right: 24px; z-index: 9999;',
            '  width: 360px; max-height: 500px; border-radius: 16px;',
            '  background: #fff; box-shadow: 0 12px 40px rgba(0,0,0,0.18);',
            '  display: flex; flex-direction: column; overflow: hidden;',
            '  opacity: 0; transform: translateY(20px) scale(0.95);',
            '  pointer-events: none;',
            '  transition: opacity 0.3s ease, transform 0.3s ease;',
            '}',
            '#emx-chatbot-panel.open {',
            '  opacity: 1; transform: translateY(0) scale(1); pointer-events: auto;',
            '}',

            '.emx-chat-header {',
            '  background: ' + BRAND_COLOR + '; color: #fff; padding: 16px 18px;',
            '  display: flex; align-items: center; justify-content: space-between;',
            '  flex-shrink: 0;',
            '}',
            '.emx-chat-header-title { font-weight: 700; font-size: 0.95rem; }',
            '.emx-chat-close {',
            '  background: none; border: none; color: #fff; cursor: pointer;',
            '  font-size: 1.3rem; line-height: 1; padding: 0 0 0 8px; opacity: 0.7;',
            '  transition: opacity 0.2s;',
            '}',
            '.emx-chat-close:hover { opacity: 1; }',

            '.emx-chat-body {',
            '  flex: 1; overflow-y: auto; padding: 16px; display: flex;',
            '  flex-direction: column; gap: 10px; min-height: 260px; max-height: 340px;',
            '}',

            '.emx-msg { max-width: 82%; padding: 10px 14px; border-radius: 14px;',
            '  font-size: 0.88rem; line-height: 1.5; word-wrap: break-word; }',
            '.emx-msg-bot {',
            '  background: #f0f0f0; color: ' + BRAND_COLOR + ';',
            '  align-self: flex-start; border-bottom-left-radius: 4px;',
            '}',
            '.emx-msg-user {',
            '  background: ' + BRAND_COLOR + '; color: #fff;',
            '  align-self: flex-end; border-bottom-right-radius: 4px;',
            '}',

            '.emx-chat-input-wrap {',
            '  display: flex; border-top: 1px solid #e8e8e8; flex-shrink: 0;',
            '}',
            '.emx-chat-input {',
            '  flex: 1; border: none; outline: none; padding: 14px 16px;',
            '  font-family: inherit; font-size: 0.88rem; color: ' + BRAND_COLOR + ';',
            '}',
            '.emx-chat-input::placeholder { color: #aaa; }',
            '.emx-chat-send {',
            '  background: ' + BRAND_YELLOW + '; border: none; padding: 0 18px;',
            '  cursor: pointer; font-weight: 700; font-size: 0.88rem;',
            '  color: ' + BRAND_COLOR + '; transition: background 0.2s;',
            '}',
            '.emx-chat-send:hover { background: #e6c200; }',

            '@media (max-width: 480px) {',
            '  #emx-chatbot-panel { right: 12px; left: 12px; width: auto; bottom: 88px; }',
            '  #emx-chatbot-btn { bottom: 16px; right: 16px; }',
            '}'
        ].join('\n');

        var style = document.createElement('style');
        style.textContent = css;
        document.head.appendChild(style);
    }

    function createWidget() {
        var btn = document.createElement('button');
        btn.id = 'emx-chatbot-btn';
        btn.setAttribute('aria-label', 'Ouvrir le chat');
        btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';

        var panel = document.createElement('div');
        panel.id = 'emx-chatbot-panel';
        panel.innerHTML = [
            '<div class="emx-chat-header">',
            '  <span class="emx-chat-header-title">' + BOT_NAME + '</span>',
            '  <button class="emx-chat-close" aria-label="Fermer">&times;</button>',
            '</div>',
            '<div class="emx-chat-body" id="emx-chat-body"></div>',
            '<div class="emx-chat-input-wrap">',
            '  <input class="emx-chat-input" id="emx-chat-input" type="text" placeholder="Tapez votre message..." autocomplete="off">',
            '  <button class="emx-chat-send" id="emx-chat-send">Envoyer</button>',
            '</div>'
        ].join('');

        document.body.appendChild(btn);
        document.body.appendChild(panel);

        var isOpen = false;

        function toggle() {
            isOpen = !isOpen;
            panel.classList.toggle('open', isOpen);
            if (isOpen) {
                var body = document.getElementById('emx-chat-body');
                if (body.children.length === 0) {
                    addMessage('Bonjour ! Comment puis-je vous aider ?', 'bot');
                }
                setTimeout(function () {
                    document.getElementById('emx-chat-input').focus();
                }, 350);
            }
        }

        btn.addEventListener('click', toggle);
        panel.querySelector('.emx-chat-close').addEventListener('click', toggle);

        var input = document.getElementById('emx-chat-input');
        var sendBtn = document.getElementById('emx-chat-send');

        function handleSend() {
            var text = input.value.trim();
            if (!text) return;
            addMessage(text, 'user');
            input.value = '';
            setTimeout(function () {
                addMessage(getReply(text), 'bot');
            }, 500 + Math.random() * 400);
        }

        sendBtn.addEventListener('click', handleSend);
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') handleSend();
        });
    }

    function addMessage(text, sender) {
        var body = document.getElementById('emx-chat-body');
        var msg = document.createElement('div');
        msg.className = 'emx-msg emx-msg-' + sender;
        msg.textContent = text;
        body.appendChild(msg);
        body.scrollTop = body.scrollHeight;
    }

    function init() {
        injectStyles();
        createWidget();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
