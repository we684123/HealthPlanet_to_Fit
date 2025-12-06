const fitbit = {
  "serviceName": "Fitbit",
  "clientId": PropertiesService.getScriptProperties().getProperty('FITBIT_API_CLIENT_ID'),
  "clientSecret": PropertiesService.getScriptProperties().getProperty('FITBIT_API_CLIENT_SECRET'),
  "setAuthorizationBaseUrl": "https://www.fitbit.com/oauth2/authorize",
  "tokenUrl": "https://api.fitbit.com/oauth2/token",
  "dataSourceUrl": "https://www.googleapis.com/fitness/v1/users/me/dataSources",
  "callback": "fbAuthCallback",
  "scope": "weight"
}

/**
 * Fitbit用の認証サービスを取得する。
 */
const getFBService = () => {
  return OAuth2.createService(fitbit.serviceName)
    .setAuthorizationBaseUrl(fitbit.setAuthorizationBaseUrl)
    .setTokenUrl(fitbit.tokenUrl)
    .setClientId(fitbit.clientId)
    .setClientSecret(fitbit.clientSecret)
    .setCallbackFunction(fitbit.callback)
    .setPropertyStore(property)
    .setScope(fitbit.scope)
    .setTokenHeaders({'Authorization': 'Basic ' + Utilities.base64Encode(fitbit.clientId + ':' + fitbit.clientSecret)});
}

function fbAuthCallback(request) {
  var service = getFBService();
  var isAuthorized = service.handleCallback(request);
  if (isAuthorized) {
    return HtmlService.createHtmlOutput('Success!');
  } else {
    return HtmlService.createHtmlOutput('Denied.');
  }
}

const fbLogoutFromService = () => {
  getFBService().reset();
  console.log("Logged out successfully")
}

/**
 * Fitbitへヘルスデータ（体重・体脂肪率）を登録する。
 */
const fbPostHealthData = (service, healthData) => {
  if (!healthData || !healthData.data) {
    console.log("No health data to post");
    return;
  }

  for (const elem of healthData.data) {
    let response;
    switch (elem.tag) {
      case BODY_FAT:
        response = fbPostFat(service, elem.date, elem.keydata);
        break;
      case BODY_WEIGHT:
        response = fbPostWeight(service, elem.date, elem.keydata);
        break;
      default:
        console.log("unknown tag. tag = " + elem.tag);
        continue;
    }

    if (response && response.getResponseCode && response.getResponseCode() === 429) {
      const quotaMsg = [
        "Fitbit API quota exceeded (429). Stop uploads.",
        "Retry after 1 hour (limit 150 requests/hour).",
        "請等一小時後再試，每小時最多150次請求。",
        "1時間後に再度お試しください。1時間あたり150回のリクエスト制限があります。"
      ].join("\n");
      console.error(quotaMsg);
      throw new Error("Fitbit API quota exceeded (429)");
    }
  }
}

function fbPostWeight(service, date, weight){
  urlWeight = 'https://api.fitbit.com/1/user/-/body/log/weight.json';

  var headers = {
    'Authorization': 'Bearer ' + service.getAccessToken()
  };

  var payloadWeight = {
    'weight' : weight,
    'date' : dayjs.dayjs(date, "YYYYMMDDHHmm").format('YYYY-MM-DD'),
    'time' : dayjs.dayjs(date, "YYYYMMDDHHmm").format('HH:mm:00')
  };

  var optionsWeight = {
    'method' : 'POST',
    'payload': payloadWeight,
    'headers' : headers,
    'muteHttpExceptions': true
  };

  var responseWeight = UrlFetchApp.fetch(urlWeight, optionsWeight);
  if (responseWeight.getResponseCode() === HTTP_STATUS_CODE_OK) {
    console.log("Fitbit weight logs(%s) have been registered successfully", date);
    console.log(responseWeight.getContentText());
  } else {
    console.log("Failed to register Fitbit weight logs(%s).", date);
    console.log(responseWeight.getResponseCode());
    console.log(responseWeight.getContentText());
  }
  return responseWeight;
}

function fbPostFat(service, date, fat){
  urlFat = 'https://api.fitbit.com/1/user/-/body/log/fat.json';

  var headers = {
    'Authorization': 'Bearer ' + service.getAccessToken()
  };

  var payloadFat = {
    'fat' : fat,
    'date' : dayjs.dayjs(date, "YYYYMMDDHHmm").format('YYYY-MM-DD'),
    'time' : dayjs.dayjs(date, "YYYYMMDDHHmm").format('HH:mm:00')
  };

  var optionsFat = {
    'method' : 'POST',
    'payload': payloadFat,
    'headers' : headers,
    'muteHttpExceptions': true
  };

  var responseFat = UrlFetchApp.fetch(urlFat, optionsFat);
  if (responseFat.getResponseCode() === HTTP_STATUS_CODE_OK) {
    console.log("Fitbit fat logs(%s) have been registered successfully", date);
    console.log(responseFat.getContentText());
  } else {
    console.log("Failed to register Fitbit fat logs(%s).", date);
    console.log(responseFat.getResponseCode());
    console.log(responseFat.getContentText());
  }
  return responseFat;
}
