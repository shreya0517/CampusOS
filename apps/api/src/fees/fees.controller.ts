import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AccessAuthGuard } from '../auth/access-auth.guard';
import { AuthorizationGuard } from '../authorization/authorization.guard';
import { CurrentAuthorization, RequireRoles } from '../authorization/authorization.decorator';
import type { AuthorizationContext } from '../authorization/authorization.types';
import { FeesService } from './fees.service';
import {
  parseCreateFeeStructureDto,
  parseCreateInvoiceDto,
  parseCreateRazorpayOrderDto,
  parseFeesListQuery,
  parseVerifyRazorpayPaymentDto,
} from './fees.dto';

@Controller('fees')
@UseGuards(AccessAuthGuard, AuthorizationGuard)
export class FeesController {
  constructor(@Inject(FeesService) private readonly service: FeesService) {}

  @Post('structures')
  @RequireRoles('ADMIN', 'HOD')
  async createFeeStructure(@Body() body: unknown, @CurrentAuthorization() context: AuthorizationContext) {
    const input = parseCreateFeeStructureDto(body);
    return this.service.createFeeStructure(input, context);
  }

  @Get('structures')
  async listFeeStructures(@CurrentAuthorization() context: AuthorizationContext) {
    return this.service.listFeeStructures(context);
  }

  @Post('invoices')
  @RequireRoles('ADMIN', 'HOD')
  async createInvoice(@Body() body: unknown, @CurrentAuthorization() context: AuthorizationContext) {
    const input = parseCreateInvoiceDto(body);
    return this.service.createInvoice(input, context);
  }

  @Get('invoices')
  async listInvoices(@Query() query: unknown, @CurrentAuthorization() context: AuthorizationContext) {
    const parsed = parseFeesListQuery(query);
    return this.service.listInvoices(parsed, context);
  }

  @Get('invoices/me')
  @RequireRoles('STUDENT')
  async getMyInvoices(@CurrentAuthorization() context: AuthorizationContext) {
    return this.service.getMyInvoices(context);
  }

  @Post('invoices/:id/create-razorpay-order')
  async createRazorpayOrder(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentAuthorization() context: AuthorizationContext,
  ) {
    const b = (body ?? {}) as Record<string, unknown>;
    const input = parseCreateRazorpayOrderDto({ ...b, invoiceId: id });
    return this.service.createRazorpayOrder(input, context);
  }

  @Post('payments/verify-razorpay')
  async verifyRazorpayPayment(@Body() body: unknown, @CurrentAuthorization() context: AuthorizationContext) {
    const input = parseVerifyRazorpayPaymentDto(body);
    return this.service.verifyRazorpayPayment(input, context);
  }

  @Get('receipts')
  async getReceipts(@CurrentAuthorization() context: AuthorizationContext) {
    return this.service.getReceipts(context);
  }
}
