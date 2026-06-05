FROM docker.io/n8nio/n8n:latest
USER root

# Restaurar el gestor de paquetes apk nativo de Alpine para instalar binarios
COPY --from=alpine:3.22 /sbin/apk /sbin/apk
COPY --from=alpine:3.22 /lib/apk /lib/apk
COPY --from=alpine:3.22 /etc/apk /etc/apk

# Instalar de forma exclusiva la CLI de Docker para comunicación con el daemon anfitrión
RUN apk add --no-cache docker-cli

# Retornar privilegios al usuario sin permisos administrativos para la ejecución segura del contenedor
USER node
