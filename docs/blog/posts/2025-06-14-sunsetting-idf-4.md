---
date: 2025-06-18
authors: 
  - kbx81
comments: true
---

# Sunsetting support for IDF 4.x

At the beginning of this year, we made the transition from IDF 4.4 to IDF 5.1; this was a major upgrade and many
changes were necessary within ESPHome to achieve this.

<!-- more -->

A long-standing (but largely undocumented -- until now) rule of the project is that we only support one major version
of [ESP-IDF](https://github.com/espressif/esp-idf) at a time. While it's technically _possible_ to support multiple
major versions, doing so introduces some significant challenges:

- Code is more messy, complex and difficult to maintain
- Changes are more complex to test
- CI run durations are (significantly) longer

As you may know, ESPHome supports using both [ESP-IDF](https://github.com/espressif/esp-idf) and
[Arduino](https://www.arduino.cc) as frameworks for projects built with Espressif's ESP32 family of microcontrollers.
Up to this point, we have been using Arduino 2.x, which is built on IDF 4.x; this effectively means we are still using
(and supporting) two different major versions of IDF. In the next release of ESPHome, we'll update the default Arduino
framework version to 3.x, which is built on IDF 5.x; this means we will no longer need to maintain compatibility with
IDF 4.x.

Just prior to switching the default IDF version to 5.1, we were running our tests against both major versions -- but
this meant that our CI took over ten hours to complete for one single release! This isn't tenable in the long term and,
after making IDF 5.1 the default, we stopped running our tests against IDF 4.x in an effort to get our CI run duration
back down to "normal"...which is still often over five hours now. (We are looking for ways to improve this, but that's
a topic for another day.)

Beyond this, maintaining a codebase with support for both major versions is just plain messy and complex. As Espressif
releases more and more new SoCs/microcontrollers, support for them won't be backported into IDF 4.x, which means that
you won't be able to use those new microcontrollers with IDF 4.x, anyway. Further, as new features and functionality
are introduced into IDF 5.x, they also won't be backported to IDF 4.x, so you won't be able to take advantage of these.

Last, but not least, we've made a number of optimizations to reduce the memory (RAM and flash) footprint of ESPHome
in this (June) release; if you were experiencing issues with IDF 5.x before, please try it again as you're more likely
to be able to use it now.

With these points in mind, we are officially sunsetting support for IDF 4.x in ESPHome. If you have kept your
project(s) back on IDF 4.x, you can continue to use versions of ESPHome prior to the July 2025 release, but you won't
be able to upgrade beyond that version. We encourage everybody to move to IDF 5.x -- specifically, in the June release,
we have switched the default IDF version to 5.3.2. In addition, we'd like to call out that we are working to accelerate
the adoption of new IDF versions; this helps us add support for new Espressif microcontrollers more quickly than we've
been able to in the past.
