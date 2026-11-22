FROM debian:bookworm-slim AS download
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl
WORKDIR /tmp
RUN curl --fail --show-error --silent --location --retry 3 -o litecoin.tar.gz https://github.com/litecoin-project/litecoin/releases/download/v0.21.5.8/litecoin-0.21.5.8-x86_64-linux-gnu.tar.gz && \
    printf '%s  %s\n' 43200c9f9d65ebc126ea5833ca9429e144c4b3273da6bb9f4e89fd7450ab1be9 litecoin.tar.gz | sha256sum -c - && \
    tar -xzf litecoin.tar.gz --strip-components=2 litecoin-0.21.5.8/bin/litecoind litecoin-0.21.5.8/bin/litecoin-cli

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 gosu && rm -rf /var/lib/apt/lists/* && \
    groupadd --system litecoin && useradd --system --gid litecoin --no-create-home --shell /usr/sbin/nologin litecoin
COPY --from=download /tmp/litecoind /tmp/litecoin-cli /usr/local/bin/
COPY entrypoint.sh /usr/local/bin/start-litecoin
COPY readiness.py /opt/litecoin/readiness.py
EXPOSE 10000
ENTRYPOINT ["/bin/sh","/usr/local/bin/start-litecoin"]
