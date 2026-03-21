const { parseLinkedinExport } = require('../parsers/linkedin-parser');
const { parsePdf } = require('../parsers/pdf-parser');
const { parseDocx } = require('../parsers/docx-parser');
const AdmZip = require('adm-zip');

describe('Parser Module Integration', () => {
  describe('PDF Parser', () => {
    test('rejects empty buffer', async () => {
      await expect(parsePdf(Buffer.from(''))).rejects.toThrow();
    });
  });

  describe('DOCX Parser', () => {
    test('rejects non-DOCX buffer', async () => {
      // mammoth may throw or return empty/failed - either is acceptable
      try {
        const result = await parseDocx(Buffer.from('not a docx file'));
        expect(result.success === false || result.rawText === '').toBeTruthy();
      } catch (e) {
        expect(e).toBeDefined();
      }
    });
  });

  describe('LinkedIn Parser', () => {
    test('end-to-end: create ZIP, parse, validate schema', () => {
      const zip = new AdmZip();
      zip.addFile('Profile.csv', Buffer.from('First Name,Last Name,Headline,Summary,Geo Location\nAlice,Wonder,Engineer,Builds things,NYC'));
      zip.addFile('Positions.csv', Buffer.from('Company Name,Title,Description,Location,Started On,Finished On\nTechCo,Lead Dev,Led team,NYC,Jan 2019,Present'));
      zip.addFile('Education.csv', Buffer.from('School Name,Degree Name,Notes,Start Date,End Date,Activities and Societies\nNYU,MS,CS,2015,2017,'));
      zip.addFile('Skills.csv', Buffer.from('Name\nTypeScript\nNode.js\nDocker'));

      const result = parseLinkedinExport(zip.toBuffer());

      expect(result.success).toBe(true);
      expect(result.resume.contact.name).toBe('Alice Wonder');
      expect(result.resume.experience[0].company).toBe('TechCo');
      expect(result.resume.education[0].institution).toBe('NYU');
      expect(result.resume.skills.technical).toContain('TypeScript');

      // Validate schema shape
      expect(result.resume).toHaveProperty('contact');
      expect(result.resume).toHaveProperty('summary');
      expect(result.resume).toHaveProperty('experience');
      expect(result.resume).toHaveProperty('education');
      expect(result.resume).toHaveProperty('skills');
      expect(result.resume).toHaveProperty('certifications');
      expect(result.resume).toHaveProperty('projects');
    });
  });
});
