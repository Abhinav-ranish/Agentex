function generateLatex(resume) {
  const lines = [];
  lines.push('\\documentclass[letterpaper,11pt]{article}');
  lines.push('\\usepackage[empty]{fullpage}');
  lines.push('\\usepackage{titlesec}');
  lines.push('\\usepackage[usenames,dvipsnames]{color}');
  lines.push('\\usepackage{enumitem}');
  lines.push('\\usepackage[hidelinks]{hyperref}');
  lines.push('\\usepackage[english]{babel}');
  lines.push('\\usepackage{tabularx}');
  lines.push('');
  lines.push('\\addtolength{\\oddsidemargin}{-0.5in}');
  lines.push('\\addtolength{\\evensidemargin}{-0.5in}');
  lines.push('\\addtolength{\\textwidth}{1in}');
  lines.push('\\addtolength{\\topmargin}{-0.5in}');
  lines.push('\\addtolength{\\textheight}{1.0in}');
  lines.push('');
  lines.push('\\titleformat{\\section}{\\vspace{-4pt}\\scshape\\raggedright\\large}{}{0em}{}[\\color{black}\\titlerule\\vspace{-5pt}]');
  lines.push('');
  lines.push('\\newcommand{\\resumeItem}[1]{\\item\\small{#1\\vspace{-2pt}}}');
  lines.push('\\newcommand{\\resumeSubheading}[4]{\\vspace{-2pt}\\item\\begin{tabular*}{0.97\\textwidth}[t]{l@{\\extracolsep{\\fill}}r}\\textbf{#1} & #2 \\\\ \\textit{\\small#3} & \\textit{\\small #4}\\end{tabular*}\\vspace{-7pt}}');
  lines.push('\\newcommand{\\resumeProjectHeading}[2]{\\item\\begin{tabular*}{0.97\\textwidth}{l@{\\extracolsep{\\fill}}r}\\small#1 & #2\\end{tabular*}\\vspace{-7pt}}');
  lines.push('');
  lines.push('\\begin{document}');
  lines.push('');

  const c = resume.contact || {};
  const contactParts = [c.phone, c.email, c.linkedin, c.website].filter(Boolean);
  lines.push('\\begin{center}');
  lines.push(`  \\textbf{\\Huge \\scshape ${escLatex(c.name || 'Your Name')}} \\\\ \\vspace{1pt}`);
  if (c.location) lines.push(`  \\small ${escLatex(c.location)} $|$`);
  lines.push(`  \\small ${contactParts.map(p => escLatex(p)).join(' $|$ ')}`);
  lines.push('\\end{center}');
  lines.push('');

  if (resume.summary) { lines.push('\\section{Summary}'); lines.push(escLatex(resume.summary)); lines.push(''); }

  if (resume.experience?.length) {
    lines.push('\\section{Experience}');
    lines.push('\\begin{itemize}[leftmargin=0.15in, label={}]');
    resume.experience.forEach(exp => {
      lines.push(`  \\resumeSubheading{${escLatex(exp.title)}}{${escLatex(exp.startDate)} -- ${escLatex(exp.endDate)}}{${escLatex(exp.company)}}{${escLatex(exp.location)}}`);
      if (exp.description || exp.highlights?.length) {
        lines.push('  \\begin{itemize}');
        if (exp.description) lines.push(`    \\resumeItem{${escLatex(exp.description)}}`);
        (exp.highlights || []).forEach(h => { if (h) lines.push(`    \\resumeItem{${escLatex(h)}}`); });
        lines.push('  \\end{itemize}');
      }
    });
    lines.push('\\end{itemize}');
    lines.push('');
  }

  if (resume.education?.length) {
    lines.push('\\section{Education}');
    lines.push('\\begin{itemize}[leftmargin=0.15in, label={}]');
    resume.education.forEach(edu => {
      const degreeField = [edu.degree, edu.field].filter(Boolean).join(' in ');
      const gpaStr = edu.gpa ? ` -- GPA: ${escLatex(edu.gpa)}` : '';
      lines.push(`  \\resumeSubheading{${escLatex(edu.institution)}}{${escLatex(edu.startDate)} -- ${escLatex(edu.endDate)}}{${escLatex(degreeField)}${gpaStr}}{}`);
    });
    lines.push('\\end{itemize}');
    lines.push('');
  }

  const allSkills = [...(resume.skills?.technical || []), ...(resume.skills?.soft || []), ...(resume.skills?.languages || [])];
  if (allSkills.length) {
    lines.push('\\section{Skills}');
    lines.push('\\begin{itemize}[leftmargin=0.15in, label={}]');
    lines.push('  \\small{\\item{');
    if (resume.skills.technical?.length) lines.push(`    \\textbf{Technical:} ${resume.skills.technical.map(escLatex).join(', ')} \\\\`);
    if (resume.skills.soft?.length) lines.push(`    \\textbf{Soft Skills:} ${resume.skills.soft.map(escLatex).join(', ')} \\\\`);
    if (resume.skills.languages?.length) lines.push(`    \\textbf{Languages:} ${resume.skills.languages.map(escLatex).join(', ')}`);
    lines.push('  }}');
    lines.push('\\end{itemize}');
    lines.push('');
  }

  if (resume.projects?.length) {
    lines.push('\\section{Projects}');
    lines.push('\\begin{itemize}[leftmargin=0.15in, label={}]');
    resume.projects.forEach(proj => {
      const techStr = proj.technologies?.length ? ` $|$ \\emph{${proj.technologies.map(escLatex).join(', ')}}` : '';
      lines.push(`  \\resumeProjectHeading{\\textbf{${escLatex(proj.name)}}${techStr}}{}`);
      if (proj.description) { lines.push('  \\begin{itemize}'); lines.push(`    \\resumeItem{${escLatex(proj.description)}}`); lines.push('  \\end{itemize}'); }
    });
    lines.push('\\end{itemize}');
    lines.push('');
  }

  if (resume.certifications?.length) {
    lines.push('\\section{Certifications}');
    lines.push('\\begin{itemize}[leftmargin=0.15in, label={}]');
    resume.certifications.forEach(cert => {
      const parts = [cert.name, cert.issuer, cert.date].filter(Boolean);
      lines.push(`  \\item\\small{${parts.map(escLatex).join(' -- ')}}`);
    });
    lines.push('\\end{itemize}');
    lines.push('');
  }

  lines.push('\\end{document}');
  return lines.join('\n');
}

function escLatex(str) {
  if (!str) return '';
  return str.replace(/\\/g, '\\textbackslash{}').replace(/[&%$#_{}]/g, m => '\\' + m).replace(/~/g, '\\textasciitilde{}').replace(/\^/g, '\\textasciicircum{}');
}

if (typeof module !== 'undefined' && module.exports) { module.exports = { generateLatex, escLatex }; }
