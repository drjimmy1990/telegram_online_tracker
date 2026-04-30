FROM python:3.11-slim

WORKDIR /app

# Install dependencies first (Docker layer caching)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY config.py .
COPY tracker.py .
COPY .env .


# Run the tracker
CMD ["python", "-u", "tracker.py"]
