
const HTTP_STATUS_CODE_OK = 200;
const HTTP_STATUS_CODE_CONFLICT = 409;
const TO_NS = 1000 * 1000 * 1000;
const property = PropertiesService.getUserProperties();

/**
 * 起動関数。
 * 
 * HealthPlanet及びGoogleFitとの認証を行う必要があるため初回は手動で実行し
 * 下記の手順に従って認証を完了させる。認証完了後はトリガー起動での定期的な実行が可能。
 * 1. 起動すると実行ログにHealthPlanet認証用URLが出力されるので、ブラウザでアクセスする
 * 2. HealthPlanetのログイン画面が表示されるのでログインする
 * 3. HealthPlanetのアクセス許可画面が表示されるのでアクセスを許可する
 * 4. Google Driveの「現在、ファイルを開くことができません。」というエラー画面が表示される
 * 5. HealthPlanetがGASから引き渡したリダイレクトURLのパラメータ部分をカットしていることが
 *    エラーの原因なので、下記の通りSTATE部分を補う（実行ログからコピー）
 *    誤）https://script.google.com/macros/d/{SCRIPT ID}/usercallback?code={CODE}
 *    正）https://script.google.com/macros/d/{SCRIPT ID}/usercallback?code={CODE}&state={STATE}
 * 6. Success!と表示されれば登録が完了。HealthPlanetの連携アプリ一覧にツールが表示される
 * 7. 続いて実行ログにGoogleFit認証用URLが出力されるので、ブラウザでアクセスする
 * 8. 続いて実行ログにFitbit認証用URLが出力されるので、ブラウザでアクセスする
 * 9. 画面の指示に従って認証を完了させる
 * 
 * HealthPlanet及びGoogleFitとのデータ削除を含む接続解除手順は下記の通り。
 * 1. removeHealthDataを実行してGoogleFitからデータセットを削除する
 *    （dataNameのコメントアウトで削除対象を切り替える）
 * 2. removeGFDataSourceを実行してGoogleFitからデータソースを削除する
 *    （dataNameのコメントアウトで削除対象を切り替える）
 * 3. listGFDataSourceを実行してデータソースが残っていないことを確認する
 * 4. GoogleFitアプリにて、このプログラムからの接続を解除する
 * 5. HealthPlanetにて、このプログラムからの接続を解除する
 * 6. logoutFromServiceを実行して、GoogleFit及びHealthPlanetから切断する
 */
const run = () => {

  setProps();

  const hpService = getHPService();
  let healthData;

  // HealthPlanetへの認証が完了していない場合は認証用URLを出力して終了する
  if (hpService.hasAccess()) {
    console.log("HealthPlanet is ready");
    healthData = fetchHealthData(hpService);
  } else {
    console.log("Please access the URL below to complete your authentication with HealthPlanet");
    console.log(hpService.getAuthorizationUrl());
    console.log("If you get a Google Drive error, please add the following parameter to the URL to access it");
    console.log(/(&state=.*?)&/.exec(hpService.getAuthorizationUrl())[1]);
  }

  const fbService = getFBService();

  // Fitbitへの認証が完了していない場合は認証用URLを出力して終了する
  if (fbService.hasAccess()) {
    console.log("Fitbit is ready");
    fbPostHealthData(fbService,healthData);
  } else {
    console.log("Please go to the URL below to complete the authentication with Fitbit");
    console.log(fbService.getAuthorizationUrl());
  }
}

/**
 * 以日期區間匯入 HealthPlanet 資料並同步至 Fitbit。
 */
const runByDayInterval = () => {
  const from = new Date('2025-01-01');
  const to = new Date('2025-01-05');
  runWithDateRange(from, to);
}

/**
 * HealthPlanetとGoogleFitとのOAuth認証を解除する（開発時用、単独で実行する）。
 * 各サービスのサイトで接続を解除した後に実行する。
 */
const logoutFromService = () => {
  getHPService().reset();
  getFBService().reset();
  property.deleteAllProperties();
  console.log("Logged out successfully")
}

/**
 * 指定日期區間(年月日)匯入 HealthPlanet 資料並同步至 Fitbit。
 * @param {Date|string} fromDate 起始日 (日期或可被 Date 建立的字串)
 * @param {Date|string} toDate   結束日 (日期或可被 Date 建立的字串)
 */
const runWithDateRange = (fromDate, toDate) => {
  try {
    setProps();

    const hpService = getHPService();
    if (!hpService.hasAccess()) {
      console.log("Please access the URL below to complete your authentication with HealthPlanet");
      console.log(hpService.getAuthorizationUrl());
      console.log("If you get a Google Drive error, please add the following parameter to the URL to access it");
      console.log(/(&state=.*?)&/.exec(hpService.getAuthorizationUrl())[1]);
      return;
    }

    const fbService = getFBService();
    if (!fbService.hasAccess()) {
      console.log("Please go to the URL below to complete the authentication with Fitbit");
      console.log(fbService.getAuthorizationUrl());
      return;
    }

    const from = formatHpDateTime(fromDate, false);
    const to = formatHpDateTime(toDate, true);

    if (from >= to) {
      throw new Error("fromDate 必須早於 toDate");
    }

    const rangeDays = (new Date(toDate) - new Date(fromDate)) / (1000 * 60 * 60 * 24);
    if (rangeDays > 93) {
      console.log("指定區間超過 3 個月，HealthPlanet 會自動縮短為 3 個月內的資料");
    }

    console.log("Fetch HealthPlanet data from %s to %s", from, to);
    const healthData = fetchHealthDataInRange(hpService, from, to);
    fbPostHealthData(fbService, healthData);
  } catch (e) {
    console.error("runWithDateRange failed: %s", e.message);
    throw e;
  }
}

/**
 * 將日期轉成 HealthPlanet 要求的 yyyyMMddHHmmss 格式。
 * @param {Date|string} value 來源日期
 * @param {boolean} endOfDay 是否使用當日 23:59:59
 * @returns {string} yyyyMMddHHmmss
 */
const formatHpDateTime = (value, endOfDay) => {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (isNaN(date.getTime())) {
    throw new Error("無法解析的日期: " + value);
  }

  if (endOfDay) {
    date.setHours(23, 59, 59, 0);
  } else {
    date.setHours(0, 0, 0, 0);
  }

  return Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyyMMddHHmmss");
}

