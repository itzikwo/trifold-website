# TriFold Technologies — Static Site
# Hosted on elest.io · Docker Compose port mapping: 3000:80
FROM nginx:alpine

# Remove default NGINX content
RUN rm -rf /usr/share/nginx/html/*

# Copy all static site files
COPY . /usr/share/nginx/html/

# Remove non-public files from the served directory
RUN rm -f /usr/share/nginx/html/Dockerfile \
          /usr/share/nginx/html/docker-compose.yml \
          /usr/share/nginx/html/netlify.toml \
          /usr/share/nginx/html/CLAUDE.md \
          /usr/share/nginx/html/README.md \
          /usr/share/nginx/html/.gitignore \
          /usr/share/nginx/html/.DS_Store \
          /usr/share/nginx/html/_redirects 2>/dev/null || true

# Write NGINX server config — clean, no redirect loops
RUN printf 'server {\n\
    listen 80;\n\
    server_name _;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
\n\
    # Serve specific assets directly\n\
    location ~* \\.(docx|xlsx|pdf|pptx|png|jpg|jpeg|svg|ico|woff|woff2)$ {\n\
        try_files $uri =404;\n\
        expires 30d;\n\
        add_header Cache-Control "public, max-age=2592000";\n\
    }\n\
\n\
    # Admin route\n\
    location = /admin { return 301 /admin.html; }\n\
\n\
    # Playbook directory — serve index.html\n\
    location /ai-strategy-playbook/ {\n\
        try_files $uri $uri/ /ai-strategy-playbook/index.html;\n\
    }\n\
\n\
    # Main site — serve index.html or specific file, fallback to 404\n\
    location / {\n\
        try_files $uri $uri/ /index.html;\n\
    }\n\
\n\
    # Custom 404\n\
    error_page 404 /404.html;\n\
    location = /404.html {\n\
        internal;\n\
    }\n\
\n\
    # Security headers\n\
    add_header X-Frame-Options "DENY" always;\n\
    add_header X-Content-Type-Options "nosniff" always;\n\
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;\n\
}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
