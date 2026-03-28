from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    database_url: str = "postgresql://birdie:birdie@localhost:5432/birdie_book"
    google_maps_api_key: str = ""
    golf_course_api_key: str = ""
    host: str = "0.0.0.0"
    port: int = 8000
    image_storage_path: str = "./app/static/images/holes"

    class Config:
        env_file = ".env"

    @property
    def image_dir(self) -> Path:
        p = Path(self.image_storage_path)
        p.mkdir(parents=True, exist_ok=True)
        return p


settings = Settings()
