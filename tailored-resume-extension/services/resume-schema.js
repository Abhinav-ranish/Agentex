const RESUME_SCHEMA = {
  contact: { name: '', email: '', phone: '', location: '', linkedin: '', website: '' },
  summary: '',
  experience: [],
  education: [],
  skills: { technical: [], soft: [], languages: [] },
  certifications: [],
  projects: []
};

const EXPERIENCE_TEMPLATE = {
  title: '', company: '', location: '', startDate: '', endDate: '', description: '', highlights: []
};

const EDUCATION_TEMPLATE = {
  institution: '', degree: '', field: '', startDate: '', endDate: '', gpa: '', highlights: []
};

const CERTIFICATION_TEMPLATE = { name: '', issuer: '', date: '' };

const PROJECT_TEMPLATE = { name: '', description: '', technologies: [], url: '' };

function createEmptyResume() {
  return JSON.parse(JSON.stringify(RESUME_SCHEMA));
}

function validateResume(data) {
  if (!data || typeof data !== 'object') return { valid: false, error: 'Data must be an object' };
  if (!data.contact || typeof data.contact !== 'object') return { valid: false, error: 'Missing contact object' };
  if (!Array.isArray(data.experience)) return { valid: false, error: 'experience must be an array' };
  if (!Array.isArray(data.education)) return { valid: false, error: 'education must be an array' };
  if (!data.skills || typeof data.skills !== 'object') return { valid: false, error: 'Missing skills object' };
  if (!Array.isArray(data.certifications)) return { valid: false, error: 'certifications must be an array' };
  if (!Array.isArray(data.projects)) return { valid: false, error: 'projects must be an array' };
  return { valid: true };
}

// Support both Node.js (server) and browser (extension) environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { RESUME_SCHEMA, EXPERIENCE_TEMPLATE, EDUCATION_TEMPLATE, CERTIFICATION_TEMPLATE, PROJECT_TEMPLATE, createEmptyResume, validateResume };
}
