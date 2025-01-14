from datetime import datetime


def on_config(config, **kwargs):
    config.copyright = f'Copyright © {datetime.now().year} ESPHome - A project from the <a target="_blank" href="https://www.openhomefoundation.org/">Open Home Foundation</a>'
