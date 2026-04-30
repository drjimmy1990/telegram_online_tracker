# Telegram Scraper API Guide

The Telegram Tracker runs an internal REST API on port `8005`. This API uses your authenticated Telegram session to scrape messages from any public or private channel/group you have access to.

## 🔐 Authentication

Every request to the API must include your custom API key to prevent unauthorized scraping.

*   **Header Key:** `x-api-key`
*   **Header Value:** The value you set for `API_KEY` in your `.env` file.

---

## 📡 Endpoint: Get Messages

Fetch recent messages from a target group, channel, or user.

**HTTP Request**
`GET http://<YOUR_VPS_IP>:8005/api/v1/messages`

**Query Parameters:**
| Parameter | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `target` | string | **Required** | The username (e.g. `BinanceAnnouncements`), invite link, or ID. |
| `limit` | integer | `50` | Maximum number of messages to return. Max 100 recommended per request. |
| `search` | string | *(empty)* | Optional. Only return messages containing this exact keyword. |
| `download_media` | boolean | `false` | Optional. If `true`, downloads photos/videos to the server and returns a direct URL link in the `media` field. |

### 🚀 N8N Setup Guide

To use this in N8N, add an **HTTP Request** node and configure it exactly like this:

1.  **Method:** `GET`
2.  **URL:** `http://<YOUR_VPS_IP>:8005/api/v1/messages`
3.  **Send Query Parameters:** Enable this switch.
    *   Name: `target` | Value: `your_target_channel`
    *   Name: `limit` | Value: `10`
4.  **Send Headers:** Enable this switch.
    *   Name: `x-api-key` | Value: `your_super_secret_key_here`

### 💻 cURL Examples

**1. Basic Request (Latest 5 messages)**
```bash
curl -X GET "http://<YOUR_VPS_IP>:8005/api/v1/messages?target=BinanceAnnouncements&limit=5" \
     -H "x-api-key: my_super_secret_key"
```

**2. Search for a specific keyword**
```bash
curl -X GET "http://<YOUR_VPS_IP>:8005/api/v1/messages?target=BinanceAnnouncements&limit=50&search=Bitcoin" \
     -H "x-api-key: my_super_secret_key"
```

---

## 📦 JSON Response Format

The API returns a JSON object containing the metadata and the array of messages.

```json
{
  "target": "BinanceAnnouncements",
  "count": 2,
  "messages": [
    {
      "id": 14502,
      "text": "Bitcoin has reached a new all-time high!",
      "date": "2026-04-30T10:15:00+00:00",
      "sender_id": 123456789,
      "views": 45000
    },
    {
      "id": 14501,
      "text": "Trading pairs for $XYZ will be listed tomorrow at 12:00 PM UTC.",
      "date": "2026-04-30T09:30:00+00:00",
      "sender_id": 123456789,
      "views": 41200
    }
  ]
}
```

### Use Cases for N8N
*   **Auto-Forwarder:** Use the HTTP node to fetch the latest message every minute, and if the `id` is new, use a Telegram Bot node to forward it to your own group.
*   **Keyword Alerts:** Fetch messages containing `search=discount`. If `count > 0`, trigger an email or WhatsApp alert to yourself.
