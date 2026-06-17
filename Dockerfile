FROM docker.io/n8nio/n8n:latest
USER root

# Instalar la CLI de Docker (necesaria porque se monta /var/run/docker.sock) copiando
# el binario estatico desde la imagen oficial docker:cli.
#
# Antes se injertaba apk desde alpine:3.22 y se hacia `apk add docker-cli`, pero la
# imagen base de n8n dejo de traer libapk.so.2.14.x, dejando ese binario apk huerfano:
#   "Error loading shared library libapk.so.2.14.9 ... exit code 127"
# Copiar el binario de docker directamente evita apk por completo y es estable ante
# actualizaciones de la imagen base.
COPY --from=docker:cli /usr/local/bin/docker /usr/local/bin/docker

# Retornar privilegios al usuario sin permisos administrativos para la ejecución segura del contenedor
USER node
