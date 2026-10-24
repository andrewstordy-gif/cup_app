const base = {
  name: 'Test Session',
  sessionType: 'Training Session',
  formLabel: 'SCA CVA — Affective Assessment',
  dateLabel: '19 Oct 2026',
  sessionCode: 'SESSION-DEMO',
  uploadStatusLabel: 'Not uploaded',
};

module.exports = Object.freeze(['PENDING', 'IN PROGRESS', 'COMPLETE'].map(status =>
  Object.freeze({ ...base, status })
));
