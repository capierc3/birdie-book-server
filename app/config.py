from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "sqlite:///birdie_book.db"
    google_maps_api_key: str = ""
    golf_course_api_key: str = ""
    host: str = "0.0.0.0"
    port: int = 8000

    class Config:
        env_file = ".env"


settings = Settings()
