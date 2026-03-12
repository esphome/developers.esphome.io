---
date: 2026-03-12
authors:
  - bdraco
comments: true
---

# http_request API Modernization: Vector-Based Headers

The `http_request` component's C++ API has been updated to use `std::vector` instead of `std::map`, `std::list`, and `std::set` for header handling. The `get_response_headers()` method (returning the full headers map) has been removed — use `get_response_header(name)` instead. Deprecated overloads using the old container types are provided until 2027.1.0.

This is a **breaking change** for external components in **ESPHome 2026.3.0 and later**.

<!-- more -->

## Background

**[PR #14024](https://github.com/esphome/esphome/pull/14024): Modernize response header handling**
**[PR #14027](https://github.com/esphome/esphome/pull/14027): Modernize request header handling**

The `http_request` API used heavyweight STL containers (`std::map`, `std::list`, `std::set`) for header storage. These containers pull in significant template code (red-black trees, hash tables) and allocate heavily on the heap. Replacing them with `std::vector<Header>` reduces flash usage and heap fragmentation.

## What's Changing

### Response headers (PR #14024)

| Before | After |
|--------|-------|
| `std::map<std::string, std::list<std::string>>` | `std::vector<Header>` |
| `std::set<std::string>` for collect_headers | `std::vector<std::string>` (pre-lowercased) |
| `get_response_headers()` returns full map | **Removed** — use `get_response_header(name)` |
| `collect_headers` parameter | Renamed to `lower_case_collect_headers` |
| `start()` with `std::set` overload | Deprecated (removal 2027.1.0) |

### Request headers (PR #14027)

| Before | After |
|--------|-------|
| `std::list<Header>` in `perform()`, `start()`, `get()`, `post()` | `std::vector<Header>` |
| `std::list<Header>` overloads for `start()`, `get()`, `post()` | Deprecated (removal 2027.1.0) |

## Who This Affects

**External components that:**

- Use `http_request` APIs to make HTTP requests
- Access response headers via `get_response_headers()`
- Pass request headers as `std::list<Header>`
- Pass collect_headers as `std::set<std::string>`

**Standard YAML configurations are not affected.**

## Migration Guide

### Request headers — change one word

```cpp
// Before
std::list<http_request::Header> headers;
headers.push_back({"Authorization", "Bearer token"});

// After
std::vector<http_request::Header> headers;
headers.push_back({"Authorization", "Bearer token"});
```

### Response headers — use singular getter

```cpp
// Before (removed)
auto headers_map = response->get_response_headers();
auto content_type_list = headers_map["content-type"];

// After
auto value = response->get_response_header("content-type");
```

### Collect headers — use vector with lowercase names

```cpp
// Before
std::set<std::string> collect = {"Content-Type", "X-Custom"};
client->start(url, method, body, headers, collect);

// After — names must be pre-lowercased
std::vector<std::string> collect = {"content-type", "x-custom"};
client->start(url, method, body, headers, collect);
```

The parameter has been renamed to `lower_case_collect_headers` to make the lowercase requirement explicit.

## Supporting Multiple ESPHome Versions

The deprecated `std::list<Header>` overloads compile on 2026.3.0 with warnings, so existing code continues to work during the transition. To suppress warnings:

```cpp
#if ESPHOME_VERSION_CODE >= VERSION_CODE(2026, 3, 0)
  std::vector<http_request::Header> headers;
#else
  std::list<http_request::Header> headers;
#endif
headers.push_back({"Authorization", "Bearer token"});
```

For response headers, `get_response_header(name)` is new in 2026.3.0:

```cpp
#if ESPHOME_VERSION_CODE >= VERSION_CODE(2026, 3, 0)
  auto value = response->get_response_header("content-type");
#else
  auto headers = response->get_response_headers();
  auto it = headers.find("content-type");
  // ...
#endif
```

## Timeline

- **ESPHome 2026.3.0 (March 2026):** New vector-based API active, old overloads deprecated
- **ESPHome 2027.1.0 (January 2027):** Deprecated `std::list` and `std::set` overloads removed

## Finding Code That Needs Updates

```bash
# Find std::list<Header> usage
grep -rn 'std::list.*Header' your_component/

# Find get_response_headers() (plural — removed)
grep -rn 'get_response_headers' your_component/

# Find std::set for collect_headers
grep -rn 'std::set.*collect\|collect_headers' your_component/
```

## Questions?

If you have questions about migrating your external component, please ask in:

- [ESPHome Discord](https://discord.gg/KhAMKrd) - #devs channel
- [ESPHome GitHub Discussions](https://github.com/esphome/esphome/discussions)

## Related Documentation

- [PR #14024: Modernize response header handling](https://github.com/esphome/esphome/pull/14024)
- [PR #14027: Modernize request header handling](https://github.com/esphome/esphome/pull/14027)
