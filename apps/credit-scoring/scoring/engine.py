"""Deterministic implementation of George's HTML reference. No training or I/O per run."""
import hashlib
import json
import math
from datetime import date
from pathlib import Path

ARTIFACT = Path(__file__).resolve().parents[1] / 'artifacts/george-html-2026.09.1.json'
MODEL = json.loads(ARTIFACT.read_text())
MODEL_HASH = hashlib.sha256(ARTIFACT.read_bytes()).hexdigest()
OPTIONAL = ['existing_debt_to_sales', 'loan_amount_eur', 'loan_term_months']
ADDITIONAL = ['inventory_value_eur', 'collateral_value_eur', 'business_debts_eur',
              'business_assets_eur', 'owner_personal_assets_eur', 'owner_personal_debts_eur',
              'external_bureau_score', 'external_bureau_report']
REQUIRED = ['merchant_type', 'commencement_date', 'active_day_ratio', 'finalized_payments',
            'avg_txn_value_eur', 'cv_txn_value', 'verified_sales_eur', 'exception_rate',
            'critical_unresolved_ratio', 'retry_success_rate', 'capture_quality', 'finality',
            'capture_quality_trend', 'revenue_trend_slope_pct', 'estimated_margin_pct']
TRACKED = REQUIRED + OPTIONAL + ADDITIONAL
PERCENT = ['active_day_ratio', 'exception_rate', 'critical_unresolved_ratio', 'retry_success_rate', 'capture_quality', 'finality']
FRACTIONS = ['active_day_ratio', 'exception_rate', 'critical_unresolved_ratio', 'retry_success_rate', 'existing_debt_to_sales']
NONNEGATIVE = PERCENT + OPTIONAL + ['finalized_payments','avg_txn_value_eur','cv_txn_value','verified_sales_eur'] + ADDITIONAL[:-2]
DISCLAIMER = 'Experimental: synthetic training data; not validated against real repayment/default outcomes. Not a lending decision.'


def validate(values, as_of):
    unknown = set(values) - set(TRACKED)
    if unknown:
        raise ValueError('Unknown fields: ' + ', '.join(sorted(unknown)))
    today = date.fromisoformat(as_of)
    for key, value in values.items():
        if value is None:
            continue
        if key == 'merchant_type':
            if value not in ['cafe_bakery', 'grocer', 'kiosk', 'takeaway']:
                raise ValueError('Unsupported merchant_type')
        elif key == 'commencement_date':
            if not isinstance(value, str) or date.fromisoformat(value) > today:
                raise ValueError('Invalid commencement_date')
        elif key == 'external_bureau_report':
            if not isinstance(value, str) or len(value) > 2000:
                raise ValueError('Invalid external_bureau_report')
        else:
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
                raise ValueError('Expected finite number: ' + key)
            if key in NONNEGATIVE and value < 0:
                raise ValueError('Negative value: ' + key)
            if key in PERCENT and value > 100:
                raise ValueError('Percentage above 100: ' + key)
            if key in ['finalized_payments','loan_term_months','external_bureau_score'] and value != int(value):
                raise ValueError('Expected integer: ' + key)


def fraction(value, floor, ceiling):
    return max(0, min(1, (value-floor)/(ceiling-floor)))


def js_round(value):
    return math.floor(value + 0.5)


def evaluate(values, as_of, experimental=False):
    validate(values, as_of)
    raw = {key: values.get(key) for key in TRACKED}
    today = date.fromisoformat(as_of)
    start = date.fromisoformat(raw['commencement_date']) if raw['commencement_date'] else None
    age = max(0, (today.year-start.year)*12 + today.month-start.month - (today.day < start.day)) if start else None
    inputs = dict(raw, business_age_months=age)
    missing = [key for key in REQUIRED if raw[key] is None]
    filled = sum(raw[key] is not None and raw[key] != '' for key in TRACKED)
    coverage = filled / len(TRACKED) * 100
    reliability = [fraction(raw[k], low, high)*100 for k, low, high, _ in MODEL['reliabilityFactors'] if raw[k] is not None]
    quality = sum(reliability)/len(reliability) if reliability else None
    confidence = (coverage + quality)/2 if quality is not None else coverage
    result = {
        'modelVersion': MODEL['modelVersion'], 'artifactSha256': MODEL_HASH,
        'businessAgeMonths': age, 'unavailableFields': missing,
        'financialProfile': None,
        'profileConfidence': {'label': 'High' if confidence >= 75 else 'Medium' if confidence >=45 else 'Low',
            'confidenceScore': confidence, 'coveragePct': coverage, 'dataReliabilityQualityPct': quality,
            'fieldsFilled': filled, 'fieldsTotal': len(TRACKED)},
    }
    if not missing:
        factors = [(k, fraction(inputs[k], low, high)*100, weight) for k, low, high, weight in MODEL['financialFactors'] if inputs[k] is not None]
        result['financialProfile'] = {'score': sum(v*w for _,v,w in factors)/sum(w for _,_,w in factors), 'scale':'0-100', 'breakdown':{k:js_round(v) for k,v,_ in factors}}
    if experimental:
        result['experimentalCredit'] = None
        if not missing:
            transformed = {k: (v/100 if k in FRACTIONS and v is not None else v) for k,v in inputs.items()}
            for category in ['grocer','kiosk','takeaway']:
                transformed['merchant_type_'+category] = int(raw['merchant_type'] == category)
            logit = MODEL['intercept'] + sum((transformed[k]-f['mean'])/f['std']*f['coef'] for k,f in MODEL['features'].items() if transformed.get(k) is not None)
            probability = 1/(1+math.exp(-logit)) if logit >= 0 else math.exp(logit)/(1+math.exp(logit))
            factor = MODEL['pdo']/math.log(2)
            statistical = max(300,min(850,MODEL['baseScore']-factor*math.log(MODEL['baseOdds'])-factor*logit))
            # The HTML applies bonuses to model units, including capture quality in percent.
            breakdown = {k:fraction(transformed[k],lo,hi)*maximum for k,(lo,hi,maximum) in MODEL['policyOverlay'].items()}
            overlay = sum(breakdown.values())
            score = max(300,min(850,statistical+overlay))
            grade = next(name for name,minimum in MODEL['gradeBands'] if score >= minimum)
            result['experimentalCredit'] = {'experimental':True,'disclaimer':DISCLAIMER,'probabilityOfDefault':probability,
                'statisticalScore':js_round(statistical),'policyOverlayPoints':overlay,'overlayBreakdown':breakdown,
                'creditScore':js_round(score),'creditGrade':grade,'scale':'300-850'}
    return result
