FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html styles.css app.js README.md /usr/share/nginx/html/

EXPOSE 80
