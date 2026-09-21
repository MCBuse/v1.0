import os
import secrets
from contextlib import asynccontextmanager
from datetime import date
from typing import Annotated
from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from .engine import MODEL, MODEL_HASH, evaluate

@asynccontextmanager
async def lifespan(app):
    if len(os.environ.get('CREDIT_SCORING_TOKEN','')) < 32:
        raise RuntimeError('CREDIT_SCORING_TOKEN must contain at least 32 characters')
    yield

app = FastAPI(title='MCBuse private scoring', version='1.0.0', lifespan=lifespan,
              docs_url=None, redoc_url=None, openapi_url=None)

def authenticate(authorization: Annotated[str | None, Header()] = None):
    token = os.environ.get('CREDIT_SCORING_TOKEN','')
    if len(token) < 32 or not secrets.compare_digest(authorization or '', 'Bearer '+token):
        raise HTTPException(401, 'Service authentication required')

class EvaluationRequest(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    values: dict[str, float | int | str | None]
    asOfDate: str = Field(pattern=r'^\d{4}-\d{2}-\d{2}$')
    experimental: bool = False
    modelVersion: str

@app.get('/health')
def health():
    return {'status':'ok'}

@app.get('/v1/model/metadata', dependencies=[Depends(authenticate)])
def metadata():
    return {**MODEL, 'artifactSha256':MODEL_HASH}

@app.post('/v1/evaluate', dependencies=[Depends(authenticate)])
def assess(request: EvaluationRequest):
    if request.modelVersion != MODEL['modelVersion']:
        raise HTTPException(409, 'Requested model version is not loaded')
    try:
        date.fromisoformat(request.asOfDate)
        return evaluate(request.values, request.asOfDate, request.experimental)
    except (ValueError, OverflowError) as exc:
        raise HTTPException(422, str(exc)) from exc
