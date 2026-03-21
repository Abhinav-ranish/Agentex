# ============================================
# Agentex Server — Production Dockerfile
# Multi-stage build: Node.js + TeX Live
# ============================================

FROM node:20-slim AS base

# Install TeX Live (minimal for resume compilation)
RUN apt-get update && apt-get install -y --no-install-recommends \
  texlive-latex-base \
  texlive-latex-recommended \
  texlive-latex-extra \
  texlive-fonts-recommended \
  texlive-fonts-extra \
  texlive-xetex \
  latexmk \
  && rm -rf /var/lib/apt/lists/*

# Verify pdflatex
RUN which pdflatex && pdflatex --version | head -1

# ============================================
# App setup
# ============================================

WORKDIR /app

# Copy package files first (Docker layer caching)
COPY package*.json ./
RUN npm ci --production && npm cache clean --force

# Copy server code
COPY server.js ./
COPY .env.example ./.env.example
COPY parsers/ ./parsers/

# Create temp directories
RUN mkdir -p /tmp/agentex/pdf

# Non-root user for security
RUN groupadd -r agentex && useradd -r -g agentex -d /app agentex
RUN chown -R agentex:agentex /app /tmp/agentex
USER agentex

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "const http=require('http');const r=http.get('http://localhost:3000/health',res=>{process.exit(res.statusCode===200?0:1)});r.on('error',()=>process.exit(1))"

EXPOSE 3000

CMD ["node", "server.js"]