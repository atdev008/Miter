# PRD - Fuel Meter Image Verification System

## 1. Project Overview
### Project Name
Fuel Meter Image Verification System

### Business Objective
ลดภาระงานของทีมตรวจสอบข้อมูล โดยใช้ระบบ OCR และ Computer Vision อ่านค่ามิเตอร์น้ำมันจากรูปภาพอัตโนมัติ และเปรียบเทียบกับค่าที่พนักงานคีย์เข้าระบบ

## 2. Summary
- รูปมิเตอร์น้ำมันแบบ Digital
- หลายรุ่น หลายยี่ห้อ
- ถ่ายจากมือถือหลายรุ่น
- ปริมาณงานประมาณ 200 รูปต่อวัน
- ประมวลผลแบบ Batch
- ระบบปัจจุบันเป็น ASP.NET Framework

## 3. Proposed Solution
Workflow:
1. Upload Image
2. Detect LCD Area (YOLO)
3. Crop LCD
4. Image Enhancement (OpenCV)
5. OCR Reading (PaddleOCR)
6. Validation
7. Compare With User Input
8. Save Result
9. Generate Excel Exception Report

## 4. Recommended Technology
- ASP.NET Framework
- Python OCR Service
- YOLOv8/YOLO11
- PaddleOCR
- OpenCV
- SQL Server
- EPPlus หรือ ClosedXML

## 5. Validation Rules
- Digits Only
- Length Validation
- Confidence Threshold < 85% => Manual Review
- Compare OCR Value กับ User Input
- Historical Trend Check (Future)

## 6. Status
- PASS
- FAIL
- LOW_CONFIDENCE
- NO_METER_FOUND
- ERROR

## 7. Excel Report
Columns:
- Image Name
- Vessel
- Capture Date
- User Input
- OCR Reading
- Difference
- Confidence
- Status

## 8. KPI
- OCR Accuracy >= 95%
- Manual Review < 10%
- Processing Time < 10 sec/image
- Capacity >= 200 images/day

## 9. Project Phases

### Phase 1 - POC (2-3 Weeks)
- เก็บภาพ 300-500 รูป
- พัฒนา Detection และ OCR
- วัด Accuracy

### Phase 2 - Pilot (2-4 Weeks)
- ทดสอบกับข้อมูลจริง
- ปรับ Validation Rules

### Phase 3 - Production
- Deploy
- Monitoring
- Dashboard

## 10. Recommendation
เริ่มจาก POC โดยใช้ YOLO + PaddleOCR + OpenCV และเชื่อมต่อกับ ASP.NET Framework ผ่าน REST API
เป้าหมาย Accuracy ไม่น้อยกว่า 95%
