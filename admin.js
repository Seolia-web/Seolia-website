
'use strict';

// ===== SOUS-STATUTS CONFIG =====
const SOUS_STATUTS = {
  prospect: [
    { value: 'appel_1_nr', label: '1er appel – Pas répondu', cls: 'sous-badge-nr' },
    { value: 'appel_1_ok', label: '1er appel – Répondu',     cls: 'sous-badge-ok' },
    { value: 'appel_2_nr', label: '2ème appel – Pas répondu',cls: 'sous-badge-nr' },
    { value: 'appel_2_ok', label: '2ème appel – Répondu',    cls: 'sous-badge-ok' },
    { value: 'appel_3_nr', label: '3ème appel – Pas répondu',cls: 'sous-badge-nr' },
    { value: 'appel_3_ok', label: '3ème appel – Répondu',    cls: 'sous-badge-ok' },
    { value: 'sans_suite', label: 'Sans suite',               cls: 'sous-badge-grey' },
  ],
  rdv: [
    { value: 'rdv_planifie', label: 'RDV planifié',   cls: 'sous-badge-warn' },
    { value: 'rdv_effectue', label: 'RDV effectué',   cls: 'sous-badge-ok'   },
    { value: 'rdv_no_show',  label: 'No-show',         cls: 'sous-badge-nr'   },
    { value: 'rdv_reporte',  label: 'RDV reporté',    cls: 'sous-badge-warn' },
  ],
  client: [
    { value: 'actif',       label: 'Actif',               cls: 'sous-badge-ok'   },
    { value: 'en_pause',    label: 'En pause',            cls: 'sous-badge-warn' },
    { value: 'resiliation', label: 'Résiliation en cours',cls: 'sous-badge-nr'   },
  ],
  perdu: [
    { value: 'prix',          label: 'Prix trop élevé', cls: 'sous-badge-grey' },
    { value: 'concurrent',    label: 'Concurrent',      cls: 'sous-badge-grey' },
    { value: 'pas_interesse', label: 'Pas intéressé',   cls: 'sous-badge-grey' },
    { value: 'injoignable',   label: 'Injoignable',     cls: 'sous-badge-nr'   },
  ],
};