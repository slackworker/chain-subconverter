# Use an official Python runtime as a parent image
FROM python:3.11-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
# Default port, can be overridden by PORT env var at runtime
ENV PORT=11200
# Default log level, can be overridden by LOG_LEVEL env var at runtime
ENV LOG_LEVEL="INFO"
# Default SSL verification for outgoing requests, can be overridden by REQUESTS_SSL_VERIFY env var at runtime
# Valid values: "true", "false", or a path to a CA bundle.
ENV REQUESTS_SSL_VERIFY="false"
# Default to false, set to "true" to show the service address config section
ENV SHOW_SERVICE_ADDRESS_CONFIG="false" 

# Set the working directory in the container
WORKDIR /app

# Copy the requirements file
COPY requirements.txt .

# Install build dependencies, then Python packages, then remove build dependencies.
# This is to compile any C extensions (like ruamel.yaml.clib) if wheels are not available
# and to keep the final image size smaller.
RUN apt-get update && \
    apt-get install -y --no-install-recommends gcc libc-dev && \
    pip install --no-cache-dir -r requirements.txt && \
    apt-get purge -y --auto-remove gcc libc-dev && \
    rm -rf /var/lib/apt/lists/*

# Copy the application code into the container
COPY chain-subconverter.py .
COPY frontend.html .
COPY script.js .
# The application serves a favicon.ico. Ensure this file is present in the same directory
# as the Dockerfile during the build process.
COPY favicon.ico .

# Add a non-root user for security and switch to it
# The application will create a 'logs' directory within /app.
# Since /app will be owned by appuser, this will succeed.
RUN useradd -m -s /bin/bash appuser && \
    chown -R appuser:appuser /app
USER appuser

# Expose the port the application runs on (defined by the PORT environment variable)
EXPOSE ${PORT}

# Define the command to run the application
CMD ["python", "chain-subconverter.py"]
