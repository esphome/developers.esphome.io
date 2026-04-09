## PR Title

`Add blog post: USE_ESP_IDF deprecated in favor of USE_ESP32`

---

## Description

Documents the deprecation of framework checks in favor of platform checks:

**C++:**
- `USE_ESP_IDF` deprecated -> Use `USE_ESP32`

**Python:**
- `CORE.using_esp_idf` deprecated -> Use `CORE.is_esp32`
- `cv.only_with_esp_idf` deprecated -> Use `cv.only_on_esp32`

Arduino-ESP32 is built on ESP-IDF, so all IDF APIs are available regardless of framework.

Related PR: esphome/esphome#12673
