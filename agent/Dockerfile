FROM python:3.12-slim
WORKDIR /app
COPY agent /app/agent
RUN pip install --no-cache-dir uv==0.9.18 && uv sync --project /app/agent --frozen --no-dev
ENV PATH="/app/agent/.venv/bin:$PATH"
ENTRYPOINT ["sfc"]
CMD ["demo"]
