// Seolia AI Chat Worker - v3
// Endpoints:
//   POST /chat           - OpenAI chatbot bridge
//   POST /create-contact - Create CRM contact from chatbot/form
//   POST /vapi-webhook   - Receive end-of-call report from Vapi AI agent

const SUPABASE_URL = 'https://tykjkpnlvuxwrurmacpx.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR5a2prcG5sdnV4d3J1cm1hY3B4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjQ0MTYwNywiZXhwIjoyMDg4MDE3NjA3fQ.HkOkAPAjf2RDkY6qa8bHcunS9QLcNNAanN94SIe5PHI';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const SYSTEM_PROMPT = `Tu es l'assistant IA de Seolia, une agence web belge spécialisée dans la création de sites web et d'agents IA pour les artisans et PME.

NOS FORMULES (prix TVAC) :
1. Essentiel IA — 499€ de mise en place + 109€/mois
   Inclus : site vitrine une page, chatbot IA, FAQ automatisée, gestion avis Google, hébergement + domaine + SSL

2. Business IA (la plus populaire ⭐) — 949€ de mise en place + 249€/mois
   Inclus : site multi-pages optimisé SEO, automation prise de RDV, gestion commandes, notifications clients, hébergement + domaine + SSL

3. Premium IA — 1 499€ de mise en place + 449€/mois
   Inclus : site premium haute qualité, agent téléphonique IA (200 min/mois), WhatsApp business, tableau de bord analytique, rapports hebdomadaires, hébergement + domaine + SSL

OFFRE LANCEMENT : frais de mise en place offerts pour les 3 premiers clients !
ENGAGEMENT : seulement 6 mois minimum, puis résiliation avec 1 mois de préavis.

DÉLAI : mise en ligne en 7 jours ouvrables.
ZONE : toute la Belgique.
CONTACT : contact@seolia.be | seolia.be

Réponds toujours en français, de façon concise et professionnelle.
Ne mentionne jamais le nom du fondateur — utilise "notre équipe" ou "l'équipe Seolia".
Pour les rendez-vous, oriente vers le formulaire de contact ou le chatbot sur la page contact.`;

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    // ─── /chat ─────────────────────────────────────────────────────────────
    if (url.pathname === '/chat' && request.method === 'POST') {
      return handleChat(request, env);
    }

    // ─── /create-contact ───────────────────────────────────────────────────
    if (url.pathname === '/create-contact' && request.method === 'POST') {
      return handleCreateContact(request, env);
    }

    // ─── /vapi-webhook ─────────────────────────────────────────────────────
    if (url.pathname === '/vapi-webhook' && request.method === 'POST') {
      return handleVapiWebhook(request, env);
    }

    return new Response('Seolia API v3', { status: 200 });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// CHAT ENDPOINT
// ═══════════════════════════════════════════════════════════════════════════
async function handleChat(request, env) {
  try {
    const body = await request.json();

    // Accept both formats: { message: "..." } or { messages: [...] }
    let messages;
    if (body.messages && Array.isArray(body.messages)) {
      messages = body.messages;
    } else if (body.message) {
      messages = [{ role: 'user', content: body.message }];
    } else {
      return jsonResponse({ error: 'No message provided' }, 400);
    }

    const fullMessages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages
    ];

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: fullMessages,
        max_tokens: 500,
        temperature: 0.7,
      }),
    });

    const data = await openaiRes.json();
    const reply = data.choices?.[0]?.message?.content || "Je n'ai pas pu générer une réponse. Veuillez réessayer.";

    return jsonResponse({ response: reply });
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CREATE CONTACT ENDPOINT (chatbot RDV + contact form)
// ═══════════════════════════════════════════════════════════════════════════
async function handleCreateContact(request, env) {
  try {
    const body = await request.json();
    const { nom, prenom, telephone, secteur, disponibilites, source, type_rdv, email } = body;

    const fullName = [nom, prenom].filter(Boolean).join(' ') || 'Inconnu';

    // Create contact
    const contactRes = await fetch(`${SUPABASE_URL}/rest/v1/contacts`, {
      method: 'POST',
      headers: supabaseHeaders(),
      body: JSON.stringify({
        nom: fullName,
        telephone: telephone || null,
        secteur: secteur || null,
        email: email || null,
        source: source || 'chatbot',
        statut: 'nouveau',
        notes_generales: disponibilites ? `Disponibilités : ${disponibilites}` : null,
        created_by: 'chatbot',
      }),
    });

    if (!contactRes.ok) {
      const err = await contactRes.text();
      return jsonResponse({ error: 'Supabase contact error', detail: err }, 500);
    }

    const contacts = await contactRes.json();
    const contact = contacts[0];

    // Create follow-up
    if (contact?.id) {
      await fetch(`${SUPABASE_URL}/rest/v1/followups`, {
        method: 'POST',
        headers: supabaseHeaders(),
        body: JSON.stringify({
          contact_id: contact.id,
          contact_nom: fullName,
          description: `RDV via ${source || 'chatbot'} — ${type_rdv || 'Rendez-vous'} | Secteur: ${secteur || '?'} | Dispo: ${disponibilites || '?'}`,
          date_prevue: new Date(Date.now() + 86400000).toISOString().split('T')[0],
          type: 'rappel',
          statut: 'à faire',
          fait: false,
        }),
      });
    }

    return jsonResponse({ success: true, contact_id: contact?.id });
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// VAPI WEBHOOK ENDPOINT (end-of-call-report)
// ═══════════════════════════════════════════════════════════════════════════
async function handleVapiWebhook(request, env) {
  try {
    const body = await request.json();
    const msg = body.message || body;

    // Only process end-of-call reports
    if (msg.type !== 'end-of-call-report') {
      return jsonResponse({ received: true });
    }

    const call = msg.call || {};
    const analysis = msg.analysis || {};
    const structured = analysis.structuredData || {};
    const summary = analysis.summary || msg.summary || '';
    const transcript = msg.transcript || '';

    // Extract caller phone from call object
    const callerPhone = call.customer?.number || structured.telephone || null;

    // Build contact name
    const nom = structured.nom || 'Appel IA';

    // Determine statut based on interest level
    const interetMap = {
      'chaud': 'hot',
      'tiede': 'warm',
      'froid': 'froid',
      'inconnu': 'nouveau'
    };
    const statut = interetMap[structured.interet] || 'nouveau';

    // Build notes
    const notes = [
      summary ? `Résumé appel : ${summary}` : null,
      structured.disponibilites ? `Disponibilités : ${structured.disponibilites}` : null,
      structured.formule_interesse ? `Formule intéressée : ${structured.formule_interesse}` : null,
      `Durée appel : ${Math.round((call.endedAt ? new Date(call.endedAt) - new Date(call.startedAt) : 0) / 1000)}s`,
      transcript ? `\n--- Transcription ---\n${transcript.substring(0, 1000)}` : null,
    ].filter(Boolean).join('\n');

    // Create contact in Supabase
    const contactRes = await fetch(`${SUPABASE_URL}/rest/v1/contacts`, {
      method: 'POST',
      headers: supabaseHeaders(),
      body: JSON.stringify({
        nom: nom,
        telephone: callerPhone,
        secteur: structured.secteur || null,
        ville: structured.ville || null,
        source: 'appel_ia',
        statut: statut,
        notes_generales: notes,
        created_by: 'agent_vocal',
      }),
    });

    if (!contactRes.ok) {
      const err = await contactRes.text();
      console.error('Supabase error:', err);
      return jsonResponse({ error: 'Failed to create contact', detail: err }, 500);
    }

    const contacts = await contactRes.json();
    const contact = contacts[0];

    // Create follow-up if RDV was taken or prospect seems interested
    if (contact?.id && (structured.rdv_pris || structured.interet === 'chaud' || structured.interet === 'tiede')) {
      const followupDesc = structured.rdv_pris
        ? `RDV convenu via agent vocal Sophie | ${structured.disponibilites || 'Disponibilités à confirmer'}`
        : `Prospect ${structured.interet || 'intéressé'} — rappeler suite appel IA | ${structured.disponibilites || ''}`;

      await fetch(`${SUPABASE_URL}/rest/v1/followups`, {
        method: 'POST',
        headers: supabaseHeaders(),
        body: JSON.stringify({
          contact_id: contact.id,
          contact_nom: nom,
          description: followupDesc,
          date_prevue: new Date(Date.now() + 86400000).toISOString().split('T')[0],
          type: 'rappel',
          statut: 'à faire',
          fait: false,
        }),
      });
    }

    return jsonResponse({ success: true, contact_id: contact?.id });
  } catch (err) {
    console.error('Vapi webhook error:', err);
    return jsonResponse({ error: err.message }, 500);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════
function supabaseHeaders() {
  return {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
