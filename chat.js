const Pagination = require("./../../../../helpers/pagination");
const chatService = require('../services/chat')
const { Op } = require('sequelize')
const sequelize = require('./../../../../db/sequelize//sequelize');
const constants = require('./../../../../config/constants.json');
const activityLogServices = require('./../../activity_logs/services/activity_logs')
//--//
// Advisor/Super Admin
const getThreads = async function (req, res, next) {
    try {
        let { userId, search } = req.body;
        if (!userId) { userId = req.userId; }
        // get threads
        let [threads, tError] = await chatService.getThreadsForInbox(req);
        if (tError) return next(tError)

        return next(threads)
    }
    catch (error) { return next(error) }
}
const getMessages = async function (req, res, next) {
    try {
        // role : endUser/receiver role : "user", "mandoob", "admin"
        let { threadId, endUserId, role, search } = req.body;
        // get end user profile
        let [receiverProfile, err] = await chatService.getProfile({ where: { id: endUserId } }, role);
        if (err) return next(err)
        let findQuery = {
            where: {
                threadId
                // [Op.or]: [
                //     {
                //         [Op.and]: [
                //             { from_id: user_id }, { to_id: receiver_id }
                //         ]
                //     },
                //     {
                //         [Op.and]: [
                //             { from_id: receiver_id }, { to_id: user_id }
                //         ]
                //     }
                // ],
                // conversation_type
            },
            include: [
                {
                    // separate:true,
                    required: false,
                    model: sequelize.models.message_status,
                    as: 'statuses',
                    where: { userId: req.appUser.id } // to get only current user status
                },
                {
                    required: false,
                    separate: true,
                    model: sequelize.models.messages_media,
                },
                {
                    required: false,
                    attributes:[['id', 'serviceId'],'userId', 'serviceName', 'serviceNameAr', 'serviceNameUr','image', 'price'],
                    model: sequelize.models.services,
                }
            ]
        }

        if (search) {
            findQuery.where.content = {
                [Op.like]: `%${search}%`
            }
        }

        let pagination = new Pagination(req, findQuery);

        let [messages, error] = await chatService.getMessages({ senderId: req.appUser.id, findQuery });
        if (error) return next(error)

        // set pagination
        pagination.setCount(messages.count);
             const payload = constants.activity_log_payload.booking_chat_opened;
       
       const [log, logErr] = await activityLogServices.createActivityLog({
           performerId: endUserId,
           performerName: req.appUser.name,
           performerRole: payload.performerRole,
           entity: payload.entity,
           entityId: req.appUser.id,
           action: payload.action,
           description: payload.description_en
               .replace('[customerName]', req.appUser.name)
               .replace('[ID]', req.appUser.id),
           descriptionUr: payload.description_ur
               .replace('[customerName]', req.appUser.name)
               .replace('[ID]', req.appUser.id),
           descriptionAr: payload.description_ar
               .replace('[customerName]', req.appUser.name)
               .replace('[ID]', req.appUser.id)
       });
       if (logErr) return next(logErr);
        return next({ endUser: receiverProfile, messages: messages.rows, pagination })
    }
    catch (error) { return next(error) }
};
const uploadMedia = async function (req, res, next) {
    try {
        // let files = req.files ? req.files : null
        let files = req.files?.files || req.files || null;

        return next({ files })
    }
    catch (error) { return next(error) }
};


//--//
module.exports = {
    getMessages,
    getThreads,
    uploadMedia,
};
