"""Offline comparison only. Does not replace the deployed reference artifact."""
import hashlib,json,platform
from pathlib import Path
import numpy as np
import pandas as pd
import scipy,sklearn
from sklearn.model_selection import train_test_split
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import roc_auc_score
from constrained_fit import fit_constrained_logistic
root=Path(__file__).resolve().parents[1]
dataset=root/'reference/merchant_credit_data.csv'
frame=pd.read_csv(dataset)
X=pd.get_dummies(frame.drop(columns=['merchant_id','default_flag','event_observed','duration_months','active_days','observed_days']),columns=['merchant_type'],drop_first=True)
a,b,c,d=train_test_split(X,frame.default_flag.values,test_size=1/3,random_state=42,stratify=frame.default_flag.values)
imputer=SimpleImputer(strategy='median'); ai=imputer.fit_transform(a);bi=imputer.transform(b)
scaler=StandardScaler().fit(ai); aa=scaler.transform(ai);bb=scaler.transform(bi)
reference=json.loads((root/'artifacts/george-html-2026.09.1.json').read_text())
report={'datasetSha256':hashlib.sha256(dataset.read_bytes()).hexdigest(),'rows':len(frame),'seed':42,'trainRows':len(a),'testRows':len(b),'python':platform.python_version(),'packages':{'numpy':np.__version__,'pandas':pd.__version__,'scipy':scipy.__version__,'scikit-learn':sklearn.__version__},'models':{}}
for name,fields in [('notebook',['business_age_months','capture_quality','finalized_payments']),('html_constraints',['business_age_months','capture_quality','finalized_payments','verified_sales_eur'])]:
 intercept,coef=fit_constrained_logistic(aa,c,1.0,{k:'max' for k in fields},list(X.columns))
 probs=lambda v:1/(1+np.exp(-np.clip(v@coef+intercept,-30,30)))
 result={'intercept':intercept,'trainAuc':roc_auc_score(c,probs(aa)),'testAuc':roc_auc_score(d,probs(bb)),'coefficients':dict(zip(X.columns,coef.tolist())),'maxCoefficientDifferenceFromHtml':max(abs(coef[i]-reference['features'][k]['coef']) for i,k in enumerate(X.columns)),'interceptDifferenceFromHtml':abs(intercept-reference['intercept'])}
 report['models'][name]=result
report['conclusion']='HTML reference preserved. Reproduction differences are recorded, not silently deployed. Synthetic AUC is not real-outcome validation.'
(root/'artifacts/reproduction-report.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:{'trainAuc':v['trainAuc'],'testAuc':v['testAuc'],'maxCoefficientDifferenceFromHtml':v['maxCoefficientDifferenceFromHtml']} for k,v in report['models'].items()},indent=2))
