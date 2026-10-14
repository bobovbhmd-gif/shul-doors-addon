ARG BUILD_FROM
FROM ${BUILD_FROM}
RUN apk add --no-cache nodejs python3 py3-pip icu-data-full tzdata \
 && pip3 install --no-cache-dir --break-system-packages pyluach==2.3.0
COPY app /app
WORKDIR /app
RUN chmod +x /app/run.sh
CMD ["/app/run.sh"]
