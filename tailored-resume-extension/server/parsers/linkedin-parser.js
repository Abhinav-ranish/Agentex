const AdmZip = require('adm-zip');
const { parse } = require('csv-parse/sync');

const EXPECTED_FILES = {
  positions: 'Positions.csv',
  education: 'Education.csv',
  skills: 'Skills.csv',
  profile: 'Profile.csv',
  certifications: 'Certifications.csv',
  projects: 'Projects.csv'
};

function parseLinkedinExport(zipBuffer) {
  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries();
  const fileMap = {};
  const warnings = [];

  for (const entry of entries) {
    const name = entry.entryName.split('/').pop();
    for (const [key, expectedName] of Object.entries(EXPECTED_FILES)) {
      if (name === expectedName) {
        fileMap[key] = entry.getData().toString('utf-8');
      }
    }
  }

  const resume = {
    contact: { name: '', email: '', phone: '', location: '', linkedin: '', website: '' },
    summary: '',
    experience: [],
    education: [],
    skills: { technical: [], soft: [], languages: [] },
    certifications: [],
    projects: []
  };

  if (fileMap.profile) {
    try {
      const rows = parse(fileMap.profile, { columns: true, skip_empty_lines: true, relax_column_count: true });
      if (rows.length > 0) {
        const p = rows[0];
        resume.contact.name = `${p['First Name'] || ''} ${p['Last Name'] || ''}`.trim();
        resume.summary = p['Summary'] || p['Headline'] || '';
        resume.contact.location = p['Geo Location'] || p['Location'] || '';
      }
    } catch (e) { warnings.push('Could not parse Profile.csv: ' + e.message); }
  }

  if (fileMap.positions) {
    try {
      const rows = parse(fileMap.positions, { columns: true, skip_empty_lines: true, relax_column_count: true });
      resume.experience = rows.map(row => ({
        title: row['Title'] || '', company: row['Company Name'] || '', location: row['Location'] || '',
        startDate: (row['Started On'] || '').trim(), endDate: row['Finished On'] ? row['Finished On'].trim() : 'Present',
        description: row['Description'] || '', highlights: []
      }));
    } catch (e) { warnings.push('Could not parse Positions.csv: ' + e.message); }
  }

  if (fileMap.education) {
    try {
      const rows = parse(fileMap.education, { columns: true, skip_empty_lines: true, relax_column_count: true });
      resume.education = rows.map(row => ({
        institution: row['School Name'] || '', degree: row['Degree Name'] || '', field: row['Notes'] || '',
        startDate: row['Start Date'] || '', endDate: row['End Date'] || '', gpa: '',
        highlights: row['Activities and Societies'] ? [row['Activities and Societies']] : []
      }));
    } catch (e) { warnings.push('Could not parse Education.csv: ' + e.message); }
  }

  if (fileMap.skills) {
    try {
      const rows = parse(fileMap.skills, { columns: true, skip_empty_lines: true, relax_column_count: true });
      resume.skills.technical = rows.map(row => row['Name'] || row[Object.keys(row)[0]] || '').filter(Boolean);
    } catch (e) { warnings.push('Could not parse Skills.csv: ' + e.message); }
  }

  if (fileMap.certifications) {
    try {
      const rows = parse(fileMap.certifications, { columns: true, skip_empty_lines: true, relax_column_count: true });
      resume.certifications = rows.map(row => ({ name: row['Name'] || '', issuer: row['Authority'] || '', date: row['Started On'] || '' }));
    } catch (e) { warnings.push('Could not parse Certifications.csv: ' + e.message); }
  }

  if (fileMap.projects) {
    try {
      const rows = parse(fileMap.projects, { columns: true, skip_empty_lines: true, relax_column_count: true });
      resume.projects = rows.map(row => ({ name: row['Title'] || '', description: row['Description'] || '', technologies: [], url: row['Url'] || '' }));
    } catch (e) { warnings.push('Could not parse Projects.csv: ' + e.message); }
  }

  const foundFiles = Object.keys(fileMap);
  const missingFiles = Object.entries(EXPECTED_FILES).filter(([key]) => !fileMap[key]).map(([, name]) => name);
  if (missingFiles.length > 0) warnings.push(`Missing files in export: ${missingFiles.join(', ')}. Those sections will be empty.`);

  return {
    success: foundFiles.length > 0, resume, foundFiles: foundFiles.map(k => EXPECTED_FILES[k]), warnings,
    error: foundFiles.length === 0 ? 'No recognized LinkedIn CSV files found in the ZIP archive.' : undefined
  };
}

module.exports = { parseLinkedinExport };
