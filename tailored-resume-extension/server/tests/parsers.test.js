const { parseLinkedinExport } = require('../parsers/linkedin-parser');
const AdmZip = require('adm-zip');

describe('LinkedIn Parser', () => {
  function createTestZip(files) {
    const zip = new AdmZip();
    for (const [name, content] of Object.entries(files)) {
      zip.addFile(name, Buffer.from(content, 'utf-8'));
    }
    return zip.toBuffer();
  }

  test('parses valid LinkedIn export with positions and profile', () => {
    const zipBuffer = createTestZip({
      'Profile.csv': 'First Name,Last Name,Headline,Summary,Geo Location\nJohn,Doe,Software Engineer,Experienced dev,San Francisco',
      'Positions.csv': 'Company Name,Title,Description,Location,Started On,Finished On\nAcme Inc,Senior Dev,Built things,SF,Jan 2020,Dec 2023',
      'Skills.csv': 'Name\nJavaScript\nPython\nReact'
    });
    const result = parseLinkedinExport(zipBuffer);
    expect(result.success).toBe(true);
    expect(result.resume.contact.name).toBe('John Doe');
    expect(result.resume.experience).toHaveLength(1);
    expect(result.resume.experience[0].title).toBe('Senior Dev');
    expect(result.resume.experience[0].company).toBe('Acme Inc');
    expect(result.resume.skills.technical).toEqual(['JavaScript', 'Python', 'React']);
  });

  test('returns warnings for missing CSV files', () => {
    const zipBuffer = createTestZip({ 'Profile.csv': 'First Name,Last Name\nJane,Smith' });
    const result = parseLinkedinExport(zipBuffer);
    expect(result.success).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('Missing files');
  });

  test('fails gracefully with empty ZIP', () => {
    const zip = new AdmZip();
    zip.addFile('random.txt', Buffer.from('not a csv'));
    const result = parseLinkedinExport(zip.toBuffer());
    expect(result.success).toBe(false);
    expect(result.error).toContain('No recognized LinkedIn CSV files');
  });

  test('handles education and certifications', () => {
    const zipBuffer = createTestZip({
      'Profile.csv': 'First Name,Last Name\nTest,User',
      'Education.csv': 'School Name,Degree Name,Notes,Start Date,End Date,Activities and Societies\nMIT,BS,Computer Science,2016,2020,Robotics Club',
      'Certifications.csv': 'Name,Authority,Started On\nAWS Solutions Architect,Amazon,2022'
    });
    const result = parseLinkedinExport(zipBuffer);
    expect(result.resume.education).toHaveLength(1);
    expect(result.resume.education[0].institution).toBe('MIT');
    expect(result.resume.certifications).toHaveLength(1);
    expect(result.resume.certifications[0].name).toBe('AWS Solutions Architect');
  });
});
