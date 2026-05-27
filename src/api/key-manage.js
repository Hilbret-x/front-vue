// src/api/key-manage.js
import { get, post } from '@/axios/request.js';

/**
 * 密钥池管理相关API
 */
const keyManageApi = {
  /**
   * 获取所有充电桩状态
   * @returns {Promise}
   */
  getKeyPools: () => {
    return get('/api/key-management/pools');
  },

  /**
   * 获取指定充电桩的密钥池详细信息
   * @param {string} stationName - 充电桩Name
   * @returns {Promise}
   */
  getStationDetail: (stationName) => {
    return get(`/api/key-management/pools/${stationName}`);
  },

  /**
   * 获取指定充电桩的可用密钥数据
   * @param {string} stationName - 充电桩Name
   * @returns {Promise}
   */
  getUsableKeys: (stationName) => {
    return get(`/api/key-management/pools/usable_keys/${stationName}`);
  },

    /**
   * 获取指定充电桩的不可用密钥数据
   * @param {string} stationName - 充电桩Name
   * @returns {Promise}
   */
  getUnusableKeys: (stationName) => {
    return get(`/api/key-management/pools/unusable_keys/${stationName}`);
  },

  /**
   * 获取指定充电桩的密钥使用记录
   * @param {string} stationName - 充电桩Name
   * @returns {Promise}
   */
  getUsageRecords: (stationName) => {
    return get(`/api/key-management/getUsekeyLog?stationName=${stationName}`);
  },

  /**
   * 获取指定充电桩的密钥补充记录
   * @param {string} stationName - 充电桩Name
   * @returns {Promise}
   */
  getRefillHistory: (stationName, date = '') => {
    const params = new URLSearchParams({ stationName });
    if (date) {
      params.set('date', date);
    }
    return get(`/api/key-management/getAddkeyLog?${params.toString()}`);
  },

  getRefillLogRetention: () => {
    return get('/api/key-management/addkeyLogRetention');
  },

  updateRefillLogRetention: (retentionDays) => {
    return post('/api/key-management/addkeyLogRetention', { retentionDays });
  }

};

export default keyManageApi;
