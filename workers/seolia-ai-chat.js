// Seolia AI Chat Worker - v7
// Endpoints:
//   POST /chat                        - OpenAI chatbot bridge
//   POST /create-contact              - Create CRM contact from chatbot/form
//   POST /vapi-webhook                - Receive end-of-call report from Vapi AI agent
//   POST /save-onboarding             - Save client questionnaire to CRM
//   GET  /validate-id                 - Validate client ID
//   POST /save-modification           - Save modification request
//   POST /mollie-create-customer      - Create Mollie customer profile
//   POST /mollie-setup-payment        - Generate SEPA mandate + setup payment link
//   POST /mollie-create-subscription  - Activate monthly subscription
//   POST /mollie-webhook              - Handle Mollie payment/subscription webhooks
//   POST /save-demande                - Save intervention request + SMS to artisan
//   GET  /get-demandes                - Get all requests for a site
//   POST /update-demande              - Update request status

const SUPABASE_URL = 'https://tykjkpnlvuxwrurmacpx.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR5a2prcG5sdnV4d3J1cm1hY3B4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjQ0MTYwNywiZXhwIjoyMDg4MDE3NjA3fQ.HkOkAPAjf2RDkY6qa8bHcunS9QLcNNAanN94SIe5PHI';

// Twilio credentials - set as Worker environment variables:
// TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM
const TWILIO_FROM_DEFAULT = '+32800720620';

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

    // ─── /save-onboarding ──────────────────────────────────────────────────
    if (url.pathname === '/save-onboarding' && request.method === 'POST') {
      return handleSaveOnboarding(request, env);
    }

    // ─── /validate-id ──────────────────────────────────────────────────────
    if (url.pathname === '/validate-id' && request.method === 'GET') {
      return handleValidateId(request, env);
    }

    // ─── /save-modification ────────────────────────────────────────────────
    if (url.pathname === '/save-modification' && request.method === 'POST') {
      return handleSaveModification(request, env);
    }

    // ─── /mollie-create-customer ────────────────────────────────────────────────
    if (url.pathname === '/mollie-create-customer' && request.method === 'POST') {
      return handleMollieCreateCustomer(request, env);
    }

    // ─── /mollie-setup-payment ──────────────────────────────────────────────────
    if (url.pathname === '/mollie-setup-payment' && request.method === 'POST') {
      return handleMollieSetupPayment(request, env);
    }

    // ─── /mollie-create-subscription ────────────────────────────────────────────
    if (url.pathname === '/mollie-create-subscription' && request.method === 'POST') {
      return handleMollieCreateSubscription(request, env);
    }

    // ─── /mollie-webhook ────────────────────────────────────────────────────────
    if (url.pathname === '/mollie-webhook' && request.method === 'POST') {
      return handleMollieWebhook(request, env);
    }

    // ─── /save-demande ──────────────────────────────────────────────────────────
    if (url.pathname === '/save-demande' && request.method === 'POST') {
      return handleSaveDemande(request, env);
    }

    // ─── /get-demandes ──────────────────────────────────────────────────────────
    if (url.pathname === '/get-demandes' && request.method === 'GET') {
      return handleGetDemandes(request, env);
    }

    // ─── /update-demande ────────────────────────────────────────────────────────
    if (url.pathname === '/update-demande' && request.method === 'POST') {
      return handleUpdateDemande(request, env);
    }

    return new Response('Seolia API v7', { status: 200 });
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
        statut: 'prospect',
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

    // Determine statut based on interest level and RDV
    const statut = structured.rdv_pris ? 'rdv' : 'prospect';

    // Build notes
    const notes = [
      summary ? `Résumé appel : ${summary}` : null,
      structured.disponibilites ? `Disponibilités : ${structured.disponibilites}` : null,
      structured.formule_interesse ? `Formule intéressée : ${structured.formule_interesse}` : null,
      `Durée appel : ${Math.round((call.endedAt ? new Date(call.endedAt) - new Date(call.startedAt) : 0) / 1000)}s`,
      transcript ? `
--- Transcription ---
${transcript.substring(0, 1000)}` : null,
    ].filter(Boolean).join('
');

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
// SAVE ONBOARDING
// ═══════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════
// VALIDATE CLIENT ID
// ═══════════════════════════════════════════════════════════════════════════
async function handleValidateId(request, env) {
  try {
    const url = new URL(request.url);
    const clientId = url.searchParams.get('id');
    if (!clientId || clientId.length !== 6) {
      return jsonResponse({ found: false, error: 'ID invalide' });
    }
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/contacts?client_id=eq.${clientId}&select=id,nom,entreprise,formule,statut`,
      { headers: supabaseHeaders() }
    );
    const rows = await resp.json();
    if (!resp.ok || !Array.isArray(rows) || rows.length === 0) {
      return jsonResponse({ found: false });
    }
    const c = rows[0];
    const displayName = c.entreprise || c.nom || '';
    return jsonResponse({ found: true, contact_id: c.id, nom: displayName, formule: c.formule || '' });
  } catch (err) {
    return jsonResponse({ found: false, error: err.message }, 500);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SAVE ONBOARDING — links to existing contact by client_id
// ═══════════════════════════════════════════════════════════════════════════
async function handleSaveOnboarding(request, env) {
  try {
    const data = await request.json();
    const { client_id, formule, submitted_at } = data;

    if (!client_id) {
      return jsonResponse({ success: false, error: 'client_id manquant' }, 400);
    }

    // Find existing contact
    const findResp = await fetch(
      `${SUPABASE_URL}/rest/v1/contacts?client_id=eq.${client_id}&select=id,nom,entreprise`,
      { headers: supabaseHeaders() }
    );
    const rows = await findResp.json();
    if (!findResp.ok || !Array.isArray(rows) || rows.length === 0) {
      return jsonResponse({ success: false, error: 'ID client inconnu' }, 404);
    }
    const contact = rows[0];

    // Store questionnaire in notes_generales with marker
    const notesJson = JSON.stringify(data, null, 2);
    const questMarker = `[QUESTIONNAIRE_ONBOARDING]
${notesJson}`;

    // Update contact with questionnaire data
    const updatePayload = {
      notes_generales: questMarker,
      updated_at: new Date().toISOString(),
    };
    await fetch(`${SUPABASE_URL}/rest/v1/contacts?id=eq.${contact.id}`, {
      method: 'PATCH',
      headers: { ...supabaseHeaders(), 'Prefer': 'return=minimal' },
      body: JSON.stringify(updatePayload),
    });

    // Create a follow-up task for the team
    await fetch(`${SUPABASE_URL}/rest/v1/followups`, {
      method: 'POST',
      headers: supabaseHeaders(),
      body: JSON.stringify({
        contact_id: contact.id,
        contact_nom: contact.entreprise || contact.nom || '',
        type: 'questionnaire',
        note: `Questionnaire reçu — Formule: ${formule || 'Non précisée'}`,
        description: `Démarrer la création du site client`,
        date_rappel: new Date(Date.now() + 86400000).toISOString().split('T')[0],
        date_prevue: new Date(Date.now() + 86400000).toISOString().split('T')[0],
        fait: false,
        created_by: 'questionnaire',
      }),
    });

    return jsonResponse({ success: true, contact_id: contact.id });
  } catch (err) {
    console.error('Save onboarding error:', err);
    return jsonResponse({ error: err.message }, 500);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SAVE MODIFICATION REQUEST
// ═══════════════════════════════════════════════════════════════════════════
async function handleSaveModification(request, env) {
  try {
    const data = await request.json();
    const { client_id, description } = data;

    if (!client_id || !description) {
      return jsonResponse({ success: false, error: 'Données manquantes' }, 400);
    }

    // Find existing contact
    const findResp = await fetch(
      `${SUPABASE_URL}/rest/v1/contacts?client_id=eq.${client_id}&select=id,nom,entreprise`,
      { headers: supabaseHeaders() }
    );
    const rows = await findResp.json();
    if (!findResp.ok || !Array.isArray(rows) || rows.length === 0) {
      return jsonResponse({ success: false, error: 'ID client inconnu' }, 404);
    }
    const contact = rows[0];

    // Save modification record
    const modResp = await fetch(`${SUPABASE_URL}/rest/v1/modifications`, {
      method: 'POST',
      headers: supabaseHeaders(),
      body: JSON.stringify({
        contact_id: contact.id,
        client_id,
        description,
        statut: 'en_attente',
        fichiers: data.fichiers || [],
      }),
    });

    if (!modResp.ok) {
      const err = await modResp.text();
      return jsonResponse({ success: false, error: err }, 500);
    }

    // Create a follow-up task
    await fetch(`${SUPABASE_URL}/rest/v1/followups`, {
      method: 'POST',
      headers: supabaseHeaders(),
      body: JSON.stringify({
        contact_id: contact.id,
        contact_nom: contact.entreprise || contact.nom || '',
        type: 'modification',
        note: `Demande de modification reçue : ${description.substring(0, 100)}`,
        description: `Traiter la modification demandée`,
        date_rappel: new Date(Date.now() + 86400000).toISOString().split('T')[0],
        date_prevue: new Date(Date.now() + 86400000).toISOString().split('T')[0],
        fait: false,
        created_by: 'questionnaire',
      }),
    });

    return jsonResponse({ success: true, contact_id: contact.id });
  } catch (err) {
    console.error('Save modification error:', err);
    return jsonResponse({ error: err.message }, 500);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MOLLIE — PRICING MAP
// ═══════════════════════════════════════════════════════════════════════════
const SEOLIA_PRICING = {
  'Essentiel IA': { setup: '499.00', mensuel: '109.00' },
  'Business IA':  { setup: '949.00', mensuel: '249.00' },
  'Premium IA':   { setup: '1499.00', mensuel: '449.00' },
  'Web Essentiel':{ setup: '149.00', mensuel: '69.00' },
  'Web Business': { setup: '299.00', mensuel: '119.00' },
  'Web Premium':  { setup: '499.00', mensuel: '199.00' },
};

// ═══════════════════════════════════════════════════════════════════════════
// MOLLIE — CREATE CUSTOMER
// ═══════════════════════════════════════════════════════════════════════════
async function handleMollieCreateCustomer(request, env) {
  try {
    const { contact_id, nom, email } = await request.json();
    if (!contact_id || !nom) return jsonResponse({ error: 'contact_id and nom required' }, 400);

    // Create Mollie customer
    const mollieRes = await fetch('https://api.mollie.com/v2/customers', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.MOLLIE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: nom,
        email: email || undefined,
        locale: 'fr_BE',
        metadata: { seolia_contact_id: String(contact_id) },
      }),
    });

    const mollieData = await mollieRes.json();
    if (!mollieRes.ok) return jsonResponse({ error: mollieData.detail || 'Mollie error', mollieData }, 500);

    // Save mollie_customer_id to Supabase
    await fetch(`${SUPABASE_URL}/rest/v1/contacts?id=eq.${contact_id}`, {
      method: 'PATCH',
      headers: { ...supabaseHeaders(), 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        mollie_customer_id: mollieData.id,
        paiement_statut: 'client_cree',
        updated_at: new Date().toISOString(),
      }),
    });

    return jsonResponse({ success: true, mollie_customer_id: mollieData.id });
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MOLLIE — SETUP PAYMENT (setup fee + SEPA mandate collection)
// ═══════════════════════════════════════════════════════════════════════════
async function handleMollieSetupPayment(request, env) {
  try {
    const { contact_id, mollie_customer_id, formule, setup_amount, nom } = await request.json();
    if (!contact_id || !mollie_customer_id) return jsonResponse({ error: 'contact_id and mollie_customer_id required' }, 400);

    const pricing = SEOLIA_PRICING[formule] || {};
    const amount = setup_amount || pricing.setup || '1.00';
    const isZeroSetup = parseFloat(amount) === 0;
    
    const chargeAmount = isZeroSetup ? '0.01' : amount;
    const description = isZeroSetup
      ? `Seolia - Autorisation SEPA (${formule || 'abonnement'})`
      : `Seolia - Frais de mise en place (${formule || 'abonnement'})`;

    const mollieRes = await fetch(`https://api.mollie.com/v2/payments`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.MOLLIE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: { currency: 'EUR', value: chargeAmount },
        customerId: mollie_customer_id,
        sequenceType: 'first',
        method: 'directdebit',
        description,
        redirectUrl: 'https://seolia.be/merci',
        webhookUrl: 'https://seolia-ai-chat.seolia.workers.dev/mollie-webhook',
        metadata: {
          seolia_contact_id: String(contact_id),
          formule: formule || '',
          is_zero_setup: String(isZeroSetup),
        },
      }),
    });

    const mollieData = await mollieRes.json();
    if (!mollieRes.ok) return jsonResponse({ error: mollieData.detail || 'Mollie error', mollieData }, 500);

    // Update contact status
    await fetch(`${SUPABASE_URL}/rest/v1/contacts?id=eq.${contact_id}`, {
      method: 'PATCH',
      headers: { ...supabaseHeaders(), 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        paiement_statut: 'mandat_en_cours',
        updated_at: new Date().toISOString(),
      }),
    });

    return jsonResponse({
      success: true,
      payment_id: mollieData.id,
      checkout_url: mollieData._links?.checkout?.href,
    });
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MOLLIE — CREATE SUBSCRIPTION (monthly recurring)
// ═══════════════════════════════════════════════════════════════════════════
async function handleMollieCreateSubscription(request, env) {
  try {
    const { contact_id, mollie_customer_id, mollie_mandate_id, formule, mensuel_amount } = await request.json();
    if (!contact_id || !mollie_customer_id || !mollie_mandate_id) {
      return jsonResponse({ error: 'contact_id, mollie_customer_id, and mollie_mandate_id required' }, 400);
    }

    const pricing = SEOLIA_PRICING[formule] || {};
    const amount = mensuel_amount || pricing.mensuel || '109.00';

    // Start subscription on the 1st of next month
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const startDate = nextMonth.toISOString().split('T')[0];

    const mollieRes = await fetch(`https://api.mollie.com/v2/customers/${mollie_customer_id}/subscriptions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.MOLLIE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: { currency: 'EUR', value: amount },
        interval: '1 month',
        startDate,
        mandateId: mollie_mandate_id,
        description: `Seolia - Abonnement ${formule || 'mensuel'}`,
        webhookUrl: 'https://seolia-ai-chat.seolia.workers.dev/mollie-webhook',
        metadata: {
          seolia_contact_id: String(contact_id),
          formule: formule || '',
        },
      }),
    });

    const mollieData = await mollieRes.json();
    if (!mollieRes.ok) return jsonResponse({ error: mollieData.detail || 'Mollie error', mollieData }, 500);

    // Update contact
    await fetch(`${SUPABASE_URL}/rest/v1/contacts?id=eq.${contact_id}`, {
      method: 'PATCH',
      headers: { ...supabaseHeaders(), 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        mollie_subscription_id: mollieData.id,
        paiement_statut: 'abonnement_actif',
        date_debut_abonnement: startDate,
        actif: true,
        updated_at: new Date().toISOString(),
      }),
    });

    return jsonResponse({ success: true, subscription_id: mollieData.id, start_date: startDate });
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MOLLIE — WEBHOOK (payment/subscription status updates)
// ═══════════════════════════════════════════════════════════════════════════
async function handleMollieWebhook(request, env) {
  try {
    const body = await request.text();
    const params = new URLSearchParams(body);
    const paymentId = params.get('id');

    if (!paymentId) return new Response('ok', { status: 200 });

    // Fetch payment details from Mollie
    const payRes = await fetch(`https://api.mollie.com/v2/payments/${paymentId}`, {
      headers: { 'Authorization': `Bearer ${env.MOLLIE_API_KEY}` },
    });
    const payment = await payRes.json();

    const contactId = payment.metadata?.seolia_contact_id;
    if (!contactId) return new Response('ok', { status: 200 });

    if (payment.status === 'paid' && payment.sequenceType === 'first') {
      const mandateId = payment.mandateId;
      await fetch(`${SUPABASE_URL}/rest/v1/contacts?id=eq.${contactId}`, {
        method: 'PATCH',
        headers: { ...supabaseHeaders(), 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          mollie_mandate_id: mandateId || null,
          paiement_statut: 'mandat_actif',
          updated_at: new Date().toISOString(),
        }),
      });
    } else if (payment.status === 'failed' || payment.status === 'canceled' || payment.status === 'expired') {
      await fetch(`${SUPABASE_URL}/rest/v1/contacts?id=eq.${contactId}`, {
        method: 'PATCH',
        headers: { ...supabaseHeaders(), 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          paiement_statut: 'echec_paiement',
          updated_at: new Date().toISOString(),
        }),
      });
    }

    return new Response('ok', { status: 200 });
  } catch (err) {
    console.error('Mollie webhook error:', err);
    return new Response('error', { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SAVE DEMANDE (intervention request)
// ═══════════════════════════════════════════════════════════════════════════
async function handleSaveDemande(request, env) {
  try {
    const body = await request.json();
    const { site_id, nom, telephone, email, description, artisan_phone, artisan_name } = body;

    if (!site_id || !nom || !telephone || !description) {
      return jsonResponse({ success: false, error: 'Champs obligatoires manquants: site_id, nom, telephone, description' }, 400);
    }

    // Save to Supabase demandes table
    const supaRes = await fetch(`${SUPABASE_URL}/rest/v1/demandes`, {
      method: 'POST',
      headers: supabaseHeaders(),
      body: JSON.stringify({
        site_id,
        nom,
        telephone,
        email: email || null,
        description,
        statut: 'nouveau',
      }),
    });

    if (!supaRes.ok) {
      const err = await supaRes.text();
      return jsonResponse({ success: false, error: 'Erreur Supabase', detail: err }, 500);
    }

    const demandes = await supaRes.json();
    const demande = demandes[0];

    // Send SMS via Twilio if artisan_phone provided
    if (artisan_phone) {
      const twilioSid = env.TWILIO_ACCOUNT_SID;
      const twilioToken = env.TWILIO_AUTH_TOKEN;
      const twilioFrom = env.TWILIO_FROM || TWILIO_FROM_DEFAULT;

      if (twilioSid && twilioToken) {
        const shortDesc = description.length > 50 ? description.substring(0, 50) + '...' : description;
        const smsBody = `🔔 Nouvelle demande sur votre site ! ${nom} - ${telephone} - ${shortDesc} Connectez-vous a votre espace pour voir les details.`;

        const twilioCredentials = btoa(`${twilioSid}:${twilioToken}`);
        const twilioRes = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Basic ${twilioCredentials}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              From: twilioFrom,
              To: artisan_phone,
              Body: smsBody,
            }).toString(),
          }
        );

        if (!twilioRes.ok) {
          const twilioErr = await twilioRes.text();
          console.error('Twilio SMS error:', twilioErr);
          // Don't fail the whole request if SMS fails
        }
      }
    }

    return jsonResponse({ success: true, id: demande?.id });
  } catch (err) {
    console.error('Save demande error:', err);
    return jsonResponse({ error: err.message }, 500);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// GET DEMANDES
// ═══════════════════════════════════════════════════════════════════════════
async function handleGetDemandes(request, env) {
  try {
    const url = new URL(request.url);
    const site_id = url.searchParams.get('site_id');
    const token = url.searchParams.get('token');

    if (!site_id || !token) {
      return jsonResponse({ error: 'site_id et token requis' }, 400);
    }

    // Validate token
    const expectedToken = site_id + '_seolia2026';
    if (token !== expectedToken) {
      return jsonResponse({ error: 'Token invalide' }, 401);
    }

    const supaRes = await fetch(
      `${SUPABASE_URL}/rest/v1/demandes?site_id=eq.${encodeURIComponent(site_id)}&order=created_at.desc`,
      { headers: supabaseHeaders() }
    );

    if (!supaRes.ok) {
      const err = await supaRes.text();
      return jsonResponse({ error: 'Erreur Supabase', detail: err }, 500);
    }

    const demandes = await supaRes.json();
    return jsonResponse({ demandes });
  } catch (err) {
    console.error('Get demandes error:', err);
    return jsonResponse({ error: err.message }, 500);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// UPDATE DEMANDE
// ═══════════════════════════════════════════════════════════════════════════
async function handleUpdateDemande(request, env) {
  try {
    const body = await request.json();
    const { id, statut, token, site_id } = body;

    if (!id || !statut || !token || !site_id) {
      return jsonResponse({ error: 'id, statut, token et site_id requis' }, 400);
    }

    // Validate token
    const expectedToken = site_id + '_seolia2026';
    if (token !== expectedToken) {
      return jsonResponse({ error: 'Token invalide' }, 401);
    }

    // Validate statut
    const validStatuts = ['nouveau', 'contacté', 'devis envoyé', 'terminé'];
    if (!validStatuts.includes(statut)) {
      return jsonResponse({ error: `Statut invalide. Valeurs acceptées: ${validStatuts.join(', ')}` }, 400);
    }

    const supaRes = await fetch(
      `${SUPABASE_URL}/rest/v1/demandes?id=eq.${encodeURIComponent(id)}&site_id=eq.${encodeURIComponent(site_id)}`,
      {
        method: 'PATCH',
        headers: { ...supabaseHeaders(), 'Prefer': 'return=minimal' },
        body: JSON.stringify({ statut }),
      }
    );

    if (!supaRes.ok) {
      const err = await supaRes.text();
      return jsonResponse({ error: 'Erreur Supabase', detail: err }, 500);
    }

    return jsonResponse({ success: true });
  } catch (err) {
    console.error('Update demande error:', err);
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
